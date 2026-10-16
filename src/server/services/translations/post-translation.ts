import { randomUUID } from "node:crypto";
import type { OutputData } from "@editorjs/editorjs";
import type { Post, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { isValidLanguageCode } from "@/lib/languages";
import { missingLanguages } from "@/lib/blog-languages";
import { resolveBlogOpenAiAccess } from "@/src/server/services/providers/credentials";
import { TranslationService } from "./TranslationService";
import { queueRelatedArticleLinks } from "@/src/server/services/growth/backlinks";
import { localizeArticleLinks } from "./translated-links";
import { localizeGroupCovers } from "@/src/server/services/growth/cover-refresh";
import { storedCoverTitle } from "@/lib/autopilot/cover-title";
import { requestPublishSync } from "@/src/server/services/publishing/sync";

/** Brand-card covers in each translation's language; a failure never fails the translation. */
async function localizeCovers(blogId: string, translationGroupId: string) {
  try {
    await localizeGroupCovers(blogId, translationGroupId);
  } catch (error) {
    console.error("[Translations] cover-localize-failed", { translationGroupId, error: error instanceof Error ? error.message : String(error) });
  }
}

const include = {
  categories: { include: { category: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.PostInclude;

/**
 * Creates a translated copy of a post in the same translation group. The copy
 * keeps the slug, status, publication date, media, author and taxonomy, so a
 * scheduled source yields a translation scheduled for the same instant.
 * Shared by the dashboard, REST API and MCP.
 */
/** Rewrites href prefixes (longest match first) in every string of an Editor.js document. */
export function rewriteLinks<T>(value: T, rewrites: Record<string, string> | undefined): T {
  const prefixes = Object.keys(rewrites ?? {}).sort((a, b) => b.length - a.length);
  if (!rewrites || prefixes.length === 0) return value;
  const rewriteHref = (url: string) => {
    const prefix = prefixes.find((candidate) => url.startsWith(candidate));
    return prefix ? rewrites[prefix] + url.slice(prefix.length) : url;
  };
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      return node.replace(/\bhref=(["'])(.*?)\1/gi, (_match, quote: string, url: string) => `href=${quote}${rewriteHref(url)}${quote}`);
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === "link" && typeof child === "string" ? rewriteHref(child) : walk(child)]));
    }
    return node;
  };
  return walk(value) as T;
}

/** The language-specific text of a post; everything else is shared by its translations. */
type PostText = Pick<Post, "title" | "coverTitle" | "content" | "excerpt" | "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription" | "keywords" | "language">;

/** Translates the language-specific text of a post. */
export async function translatePostText(translator: TranslationService, source: PostText, targetLanguage: string) {
  const from = source.language;
  const text = (value: string | null) => (value ? translator.translateText(value, targetLanguage, from) : Promise.resolve(null));
  const [content, title, coverTitle, excerpt, metaTitle, metaDescription, ogTitle, ogDescription, keywords] = await Promise.all([
    translator.translatePostContent(source.content as unknown as OutputData, targetLanguage, from),
    translator.translateText(source.title, targetLanguage, from),
    // The thumbnail headline, so a brand card is drawn in this language (see localizeGroupCovers).
    text(source.coverTitle),
    text(source.excerpt), text(source.metaTitle), text(source.metaDescription),
    text(source.ogTitle), text(source.ogDescription), text(source.keywords),
  ]);
  return { content, title, coverTitle: storedCoverTitle(coverTitle), excerpt, metaTitle, metaDescription, ogTitle, ogDescription, keywords };
}

/** Whether a write changed text that translations are made from (timestamps and image-only changes are ignored). */
export function translatableTextChanged(before: Omit<PostText, "language">, after: Omit<PostText, "language">) {
  const fields = ["title", "coverTitle", "excerpt", "metaTitle", "metaDescription", "ogTitle", "ogDescription", "keywords"] as const;
  if (fields.some((field) => (before[field] ?? null) !== (after[field] ?? null))) return true;
  // Uploading or moving an image must not spend credits retranslating the
  // whole article. Image blocks carry media metadata; the surrounding article
  // text is the source of truth for translation.
  const blocks = (content: Prisma.JsonValue) => JSON.stringify(
    ((content as { blocks?: Array<{ type?: unknown }> } | null)?.blocks ?? []).filter(block => block?.type !== "image"),
  );
  return blocks(before.content) !== blocks(after.content);
}

export async function createPostTranslation(blogId: string, postId: string, targetLanguage: string, linkRewrites?: Record<string, string>) {
  if (!isValidLanguageCode(targetLanguage)) throw new ApiError(400, `Invalid language code: ${targetLanguage}`);
  const source = await prisma.post.findFirst({ where: { id: postId, blogId }, include });
  if (!source) throw new ApiError(404, "Post not found");
  if (source.language === targetLanguage) throw new ApiError(400, "Target language must differ from the post language");

  const translationGroupId = source.translationGroupId ?? randomUUID();
  const existing = await prisma.post.findFirst({
    where: { blogId, translationGroupId, language: targetLanguage },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, `A ${targetLanguage} translation already exists (post ${existing.id})`);

  // Billed to the blog owner's own key on lifetime plans, to the platform on subscriptions.
  const translator = new TranslationService(await resolveBlogOpenAiAccess(blogId), blogId);
  const { content, title, coverTitle, excerpt, metaTitle, metaDescription, ogTitle, ogDescription, keywords } = await translatePostText(translator, source, targetLanguage);

  // Callers that map paths themselves (MCP `paths`) keep that; otherwise links follow translated articles.
  const linkedContent = linkRewrites
    ? rewriteLinks(content, linkRewrites)
    : await localizeArticleLinks(blogId, content, source.language, targetLanguage);
  const created = await prisma.$transaction(async (tx) => {
    if (!source.translationGroupId) {
      await tx.post.update({ where: { id: source.id }, data: { translationGroupId } });
    }
    return tx.post.create({
      data: {
        blogId,
        translationGroupId,
        language: targetLanguage,
        slug: source.slug,
        title,
        coverTitle,
        content: linkedContent as unknown as Prisma.InputJsonValue,
        excerpt,
        metaTitle,
        metaDescription,
        ogTitle,
        ogDescription,
        keywords,
        coverImage: source.coverImage,
        ogImage: source.ogImage,
        canonicalUrl: source.canonicalUrl,
        status: source.status,
        featured: source.featured,
        publishedAt: source.publishedAt,
        authorId: source.authorId,
        categories: source.categories.length ? { create: source.categories.map(({ categoryId }) => ({ categoryId })) } : undefined,
        tags: source.tags.length ? { create: source.tags.map(({ tagId }) => ({ tagId })) } : undefined,
      },
      include,
    });
  });
  // A translation that goes live straight away gets links from related articles too.
  if (created.status === "published") queueRelatedArticleLinks(created.id);
  await localizeCovers(blogId, translationGroupId);
  requestPublishSync(blogId);
  return created;
}

/**
 * Translates one post into several languages, one at a time so a long post
 * never floods the model provider. A failure in one language never aborts the
 * others; each outcome is reported separately.
 */
export async function translatePostInto(blogId: string, postId: string, languages: string[], paths?: Record<string, Record<string, string>>) {
  const created: { language: string; id: string; title: string; status: string }[] = [];
  const skipped: { language: string; reason: string }[] = [];
  const failed: { language: string; error: string }[] = [];
  for (const language of languages) {
    try {
      const post = await createPostTranslation(blogId, postId, language, paths?.[language]);
      created.push({ language, id: post.id, title: post.title, status: post.status });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) skipped.push({ language, reason: error.message });
      else if (error instanceof ApiError && error.status !== 500) {
        // Missing posts, keys or configuration affect every language equally.
        if (error.status === 404 || error.status === 412 || error.status === 503) throw error;
        failed.push({ language, error: error.message });
      } else {
        console.error("[Translations] failed", { postId, language, error: error instanceof Error ? error.message : String(error) });
        failed.push({ language, error: "The translation provider failed; retry this language" });
      }
    }
  }
  return { created, skipped, failed };
}

/**
 * Brings a post's translation group in step with it: every other translation
 * gets its shared fields (media, status, dates, author, taxonomy) and, when the
 * post's text changed (translationSyncPending), a fresh translation of it; blog
 * languages the group lacks are added. `version` (the post's updatedAt when the
 * sync was requested) skips requests a newer write has superseded.
 */
export async function syncTranslationGroup(postId: string, version?: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { ...include, blog: { select: { languages: true, autoSyncTranslations: true } } },
  });
  if (!post || !post.blog.autoSyncTranslations) return { skipped: "Automatic translation is off" };
  if (version && post.updatedAt.toISOString() !== version) return { skipped: "Superseded by a newer change" };

  let source = post;
  if (!source.translationGroupId) {
    const translationGroupId = randomUUID();
    await prisma.post.updateMany({ where: { id: source.id, translationGroupId: null }, data: { translationGroupId } });
    const refreshed = await prisma.post.findUnique({ where: { id: postId }, include: { ...include, blog: { select: { languages: true, autoSyncTranslations: true } } } });
    if (!refreshed?.translationGroupId) return { skipped: "Post not found" };
    source = refreshed;
  }

  const translations = await prisma.post.findMany({
    where: { blogId: source.blogId, translationGroupId: source.translationGroupId, id: { not: source.id } },
    select: { id: true, language: true, status: true, coverImage: true },
  });
  const retranslate = source.translationSyncPending;
  let translator: TranslationService | null = null;
  const getTranslator = async () => (translator ??= new TranslationService(await resolveBlogOpenAiAccess(source.blogId), source.blogId));

  const shared = {
    coverImage: source.coverImage,
    ogImage: source.ogImage,
    canonicalUrl: source.canonicalUrl,
    status: source.status,
    featured: source.featured,
    publishedAt: source.publishedAt,
    authorId: source.authorId,
  };
  // A brand card has text, so each translation has its own drawn from the same
  // art: it is kept unless the text changed, then redrawn by localizeCovers.
  const cards = new Set((await prisma.mediaAsset.findMany({
    where: { blogId: source.blogId, kind: "cover", origin: "template", url: { in: [source.coverImage, ...translations.map((translation) => translation.coverImage)].filter((url): url is string => Boolean(url)) } },
    select: { url: true },
  })).map((card) => card.url));
  const keepsOwnCard = (coverImage: string | null) =>
    !retranslate && Boolean(source.coverImage && cards.has(source.coverImage) && coverImage && cards.has(coverImage));
  const updated: string[] = [];
  const failed: { language: string; error: string }[] = [];
  for (const translation of translations) {
    try {
      const translated = retranslate ? await translatePostText(await getTranslator(), source, translation.language) : null;
      const text = translated && { ...translated, content: await localizeArticleLinks(source.blogId, translated.content, source.language, translation.language) };
      await prisma.post.update({
        where: { id: translation.id },
        data: {
          ...shared,
          ...(keepsOwnCard(translation.coverImage) ? { coverImage: translation.coverImage } : {}),
          ...(text ? { ...text, content: text.content as unknown as Prisma.InputJsonValue } : {}),
          translationSyncPending: false,
          categories: { deleteMany: {}, create: source.categories.map(({ categoryId }) => ({ categoryId })) },
          tags: { deleteMany: {}, create: source.tags.map(({ tagId }) => ({ tagId })) },
        },
      });
      updated.push(translation.language);
      if (shared.status === "published" && translation.status !== "published") queueRelatedArticleLinks(translation.id);
    } catch (error) {
      failed.push({ language: translation.language, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const missing = missingLanguages(source.blog.languages, [source.language, ...translations.map((translation) => translation.language)]);
  const created: string[] = [];
  for (const language of missing) {
    try {
      await createPostTranslation(source.blogId, source.id, language);
      created.push(language);
    } catch (error) {
      // A concurrent sync may have added it already.
      if (error instanceof ApiError && error.status === 409) continue;
      failed.push({ language, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Unless a newer write changed the text again meanwhile, it is now translated.
  if (retranslate && !failed.length) {
    await prisma.post.updateMany({ where: { id: source.id, updatedAt: source.updatedAt }, data: { translationSyncPending: false } });
  }
  if (failed.length) console.error("[Translations] sync-failed", { postId, failed });
  await localizeCovers(source.blogId, source.translationGroupId!);
  requestPublishSync(source.blogId);
  return { updated, created, failed };
}
