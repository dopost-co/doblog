import { randomUUID } from "node:crypto";
import type { OutputData } from "@editorjs/editorjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { isValidLanguageCode } from "@/lib/languages";
import { TranslationService } from "./TranslationService";

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
export async function createPostTranslation(blogId: string, postId: string, targetLanguage: string) {
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

  const translator = new TranslationService();
  if (!translator.isConfigured) throw new ApiError(503, "Translation is not configured: OPENAI_API_KEY is missing");

  const from = source.language;
  const text = (value: string | null) => (value ? translator.translateText(value, targetLanguage, from) : Promise.resolve(null));
  const [content, title, excerpt, metaTitle, metaDescription, ogTitle, ogDescription, keywords] = await Promise.all([
    translator.translatePostContent(source.content as unknown as OutputData, targetLanguage, from),
    translator.translateText(source.title, targetLanguage, from),
    text(source.excerpt), text(source.metaTitle), text(source.metaDescription),
    text(source.ogTitle), text(source.ogDescription), text(source.keywords),
  ]);

  return prisma.$transaction(async (tx) => {
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
        content: content as unknown as Prisma.InputJsonValue,
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
}

/**
 * Translates one post into several languages, one at a time so a long post
 * never floods the model provider. A failure in one language never aborts the
 * others; each outcome is reported separately.
 */
export async function translatePostInto(blogId: string, postId: string, languages: string[]) {
  const created: { language: string; id: string; title: string; status: string }[] = [];
  const skipped: { language: string; reason: string }[] = [];
  const failed: { language: string; error: string }[] = [];
  for (const language of languages) {
    try {
      const post = await createPostTranslation(blogId, postId, language);
      created.push({ language, id: post.id, title: post.title, status: post.status });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) skipped.push({ language, reason: error.message });
      else if (error instanceof ApiError && error.status !== 500) {
        // Missing posts or configuration affect every language equally.
        if (error.status === 404 || error.status === 503) throw error;
        failed.push({ language, error: error.message });
      } else {
        console.error("[Translations] failed", { postId, language, error: error instanceof Error ? error.message : String(error) });
        failed.push({ language, error: "The translation provider failed; retry this language" });
      }
    }
  }
  return { created, skipped, failed };
}
