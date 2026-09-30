import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateContent } from "@/src/server/services/content/cache";
import { articleHref, articlePrefixFor, linkFirstMention, linkPhrases, rankLinkTargets } from "./internal-links";

/** Existing articles that get a link to each new one. */
const MAX_BACKLINKS = 3;
/** Related articles checked for a natural mention before giving up. */
const BACKLINK_CANDIDATES = 10;

type EditorContent = { blocks?: Array<{ type?: string; data?: { text?: unknown } }> };

/**
 * Unless the blog turned it off, links a newly published article from up to three
 * related published articles, at the first natural mention of its keywords.
 * No AI involved: an exact phrase already in the text becomes the link. An
 * article someone edited meanwhile is left untouched.
 */
export async function linkFromRelatedArticles(postId: string) {
  const none = { linked: [] as string[] };
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true, blogId: true, slug: true, title: true, language: true, status: true, canonicalUrl: true, translationGroupId: true, keywords: true,
      seoTarget: { select: { primaryKeyword: true, secondaryKeywords: true, cluster: true } },
      blog: { select: { blogId: true, deletedAt: true, seoSettings: { select: { backlinksEnabled: true, articleUrlPrefix: true, articlePaths: true } } } },
    },
  });
  // On by default, including blogs that never opened Autopilot settings.
  if (!post || post.status !== "published" || post.blog.deletedAt || post.blog.seoSettings?.backlinksEnabled === false) return none;

  // Only Autopilot articles, or translations of one; posts written by hand never edit others.
  const target = post.seoTarget ?? (post.translationGroupId
    ? (await prisma.postSeoTarget.findFirst({ where: { post: { translationGroupId: post.translationGroupId } }, select: { primaryKeyword: true, secondaryKeywords: true, cluster: true } }))
    : null);
  if (!target) return none;

  // The post's own keywords are in its language (translations translate them);
  // the Autopilot target is the fallback for the original article.
  const ownKeywords = (post.keywords ?? "").split(",");
  const phrases = linkPhrases(ownKeywords.some((keyword) => keyword.trim()) ? ownKeywords : [target.primaryKeyword, ...target.secondaryKeywords]);
  if (!phrases.length) return none;
  const keyword = phrases[phrases.length - 1];
  const articleUrlPrefix = articlePrefixFor(post.blog.seoSettings, post.language);
  const href = articleHref(articleUrlPrefix, post.slug, post.canonicalUrl);

  // Only articles whose text already mentions the topic can link to it naturally;
  // the database finds them without loading every article's content.
  const patterns = phrases.map((phrase) => `%${phrase.replace(/[\\%_]/g, "\\$&")}%`);
  const mentioning = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Post"
    WHERE "blogId" = ${post.blogId} AND "language" = ${post.language} AND "status" = 'published' AND "id" <> ${post.id}
      AND ("translationGroupId" IS NULL OR "translationGroupId" <> ${post.translationGroupId ?? ""})
      AND "content"::text ILIKE ANY(${patterns})
    ORDER BY "publishedAt" DESC NULLS LAST
    LIMIT 50`;
  if (!mentioning.length) return none;
  const others = await prisma.post.findMany({
    where: { id: { in: mentioning.map((row) => row.id) } },
    select: { id: true, title: true, slug: true, excerpt: true, metaDescription: true, canonicalUrl: true, publishedAt: true, seoTarget: { select: { cluster: true, primaryKeyword: true } } },
    orderBy: { publishedAt: "desc" },
  });
  // Most related first; among equals, most recent first.
  const related = rankLinkTargets(
    { keyword, secondaryKeywords: phrases, cluster: target.cluster },
    others.map((other) => ({
      id: other.id, title: other.title, summary: other.excerpt || other.metaDescription || "",
      href: articleHref(articleUrlPrefix, other.slug, other.canonicalUrl),
      cluster: other.seoTarget?.cluster ?? null, keyword: other.seoTarget?.primaryKeyword ?? null,
    })),
    BACKLINK_CANDIDATES,
    { keepUnrelated: true },
  );
  if (!related.length) return none;

  const contents = await prisma.post.findMany({ where: { id: { in: related.map((item) => item.id) } }, select: { id: true, content: true, updatedAt: true } });
  const byId = new Map(contents.map((item) => [item.id, item]));
  const linked: string[] = [];
  for (const candidate of related) {
    if (linked.length >= MAX_BACKLINKS) break;
    const current = byId.get(candidate.id);
    const content = current?.content as EditorContent | null;
    if (!current || !content?.blocks || JSON.stringify(content).includes(href)) continue;
    const blocks = content.blocks.map((block) => ({ ...block }));
    const index = blocks.findIndex((block) => block.type === "paragraph" && typeof block.data?.text === "string" && linkFirstMention(block.data.text, phrases, href) !== null);
    if (index === -1) continue;
    blocks[index] = { ...blocks[index], data: { ...blocks[index].data, text: linkFirstMention(blocks[index].data!.text as string, phrases, href) } };
    const saved = await prisma.post.updateMany({
      where: { id: current.id, updatedAt: current.updatedAt },
      data: { content: { ...content, blocks } as unknown as Prisma.InputJsonValue },
    });
    if (saved.count === 1) linked.push(current.id);
  }
  if (linked.length) {
    // Cached pages expire on their own if this runs where revalidation is not allowed.
    try { invalidateContent({ blogId: post.blogId, publicBlogId: post.blog.blogId }); } catch { /* best effort */ }
  }
  return { linked };
}

/** Runs linkFromRelatedArticles after the response; never affects the publish itself. */
export function queueRelatedArticleLinks(postId: string) {
  const work = () => linkFromRelatedArticles(postId)
    .then((result) => { if (result.linked.length) console.log("[Growth] backlinks-added", { postId, linked: result.linked }); })
    .catch((error) => console.error("[Growth] backlinks-failed", { postId, error: error instanceof Error ? error.message : String(error) }));
  try { after(work); } catch { void work(); }
}
