import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { convertBlocksToHtml } from "@/lib/editorjs-to-html";
import { PROTOCOL_VERSION, type ZenexArticle } from "@/lib/publishing/protocol";

export const ARTICLE_SELECT = {
  id: true, blogId: true, title: true, slug: true, content: true, excerpt: true, coverImage: true, featured: true,
  publishedAt: true, createdAt: true, updatedAt: true, language: true, translationGroupId: true,
  metaTitle: true, metaDescription: true, canonicalUrl: true, ogTitle: true, ogDescription: true, ogImage: true, keywords: true,
  author: { select: { name: true, slug: true } },
  categories: { select: { category: { select: { name: true, slug: true } } } },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
} satisfies Prisma.PostSelect;

export type ArticleSource = Prisma.PostGetPayload<{ select: typeof ARTICLE_SELECT }>;
export type Sibling = { id: string; language: string; slug: string; translationGroupId: string | null };

/** Media is stored with absolute URLs; anything relative is resolved against the app. */
export function absoluteUrl(value: string | null | undefined) {
  if (!value) return null;
  try { return new URL(value).toString(); } catch { /* relative */ }
  const base = process.env.NEXTAUTH_URL?.trim();
  if (!base || !value.startsWith("/")) return null;
  try { return new URL(value, base).toString(); } catch { return null; }
}

function imagesIn(html: string) {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1].replace(/&amp;/g, "&"));
}

/** The article as sites receive it. `siblings` are the other published languages. */
export function toArticle(post: ArticleSource, siblings: Sibling[] = []): ZenexArticle {
  const html = convertBlocksToHtml(post.content);
  const cover = absoluteUrl(post.coverImage);
  const ogImage = absoluteUrl(post.ogImage);
  const images = [...new Set([cover, ...imagesIn(html).map(absoluteUrl), ogImage].filter((url): url is string => Boolean(url)))];
  return {
    id: post.id,
    translationGroupId: post.translationGroupId,
    language: post.language,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    html,
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    featured: post.featured,
    coverImage: cover ? { url: cover, alt: post.title } : null,
    author: post.author ? { name: post.author.name, slug: post.author.slug } : null,
    categories: post.categories.map(({ category }) => ({ name: category.name, slug: category.slug })),
    tags: post.tags.map(({ tag }) => ({ name: tag.name, slug: tag.slug })),
    seo: {
      title: post.metaTitle, description: post.metaDescription, canonicalUrl: post.canonicalUrl,
      ogTitle: post.ogTitle, ogDescription: post.ogDescription, ogImage, keywords: post.keywords,
    },
    translations: siblings
      .filter((sibling) => sibling.id !== post.id && post.translationGroupId && sibling.translationGroupId === post.translationGroupId)
      .map(({ id, language, slug }) => ({ id, language, slug }))
      .sort((a, b) => a.language.localeCompare(b.language)),
    images,
  };
}

/**
 * Fingerprint of what a destination receives. `updatedAt` is left out so a
 * save that changes nothing visible does not resend the article.
 */
export function articleHash(article: ZenexArticle, destinationVersion: string) {
  const visible = { ...article, updatedAt: null };
  return createHash("sha256").update(`${PROTOCOL_VERSION}:${destinationVersion}:${JSON.stringify(visible)}`).digest("hex");
}
