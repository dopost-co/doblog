import { createHash } from "node:crypto";
import { after } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { isLogoPosition } from "@/lib/autopilot/logo";
import { coverTypography, isThumbnailFormat, thumbnailColors } from "@/lib/autopilot/thumbnail-templates";
import { REFRESH_THUMBNAIL_PATH, getQStashClient, getQStashDestinationBaseUrl, isQStashConfigured } from "@/lib/qstash";
import { resolveBlogOpenAiKey } from "@/src/server/services/providers/credentials";
import { uploadBlogImage } from "@/src/server/services/media/upload";
import { resolveCoverTitle } from "./cover-title";
import { loadLogo, loadStyleReferences } from "./image-references";
import { imageSubject } from "./image-subject";
import { makeCover } from "./images";

/** Deliveries after the first one; QStash backs off between them. */
export const COVER_REFRESH_RETRIES = 2;
/**
 * Most covers one request queues. Each one spends an image generation, so a
 * larger blog is refreshed in several passes rather than in one unbounded bill.
 */
export const COVER_REFRESH_LIMIT = 200;

/**
 * Articles whose cover this blog generated, newest first.
 *
 * A cover uploaded by hand or set to an outside URL is never touched: only a
 * post whose current `coverImage` is a media asset we made for it is refreshed.
 */
export async function refreshableCoverPostIds(blogId: string, limit = COVER_REFRESH_LIMIT) {
  const assets = await prisma.mediaAsset.findMany({
    where: { blogId, kind: "cover", post: { blogId, coverImage: { not: null } } },
    orderBy: { createdAt: "desc" },
    select: { url: true, postId: true, post: { select: { coverImage: true } } },
  });
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const asset of assets) {
    if (!asset.postId || seen.has(asset.postId)) continue;
    // The post may have been given a different cover since; only ours is replaced.
    if (asset.post?.coverImage !== asset.url) continue;
    seen.add(asset.postId);
    ids.push(asset.postId);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** How many covers a refresh would redraw right now, for the confirmation. */
export async function countRefreshableCovers(blogId: string) {
  return (await refreshableCoverPostIds(blogId)).length;
}

/**
 * Redraws one article's cover with the blog's saved thumbnail settings and
 * points the article at it. Used after the settings or the template change, so
 * older articles do not keep an outdated cover.
 */
export async function refreshPostCover(blogId: string, postId: string) {
  const [post, settings, blog] = await Promise.all([
    prisma.post.findFirst({
      where: { id: postId, blogId },
      select: { id: true, title: true, coverTitle: true, excerpt: true, content: true },
    }),
    prisma.blogSeoSettings.findUnique({ where: { blogId } }),
    prisma.blog.findUnique({ where: { id: blogId }, select: { name: true } }),
  ]);
  if (!post || !blog) throw new ApiError(404, "Article not found");

  const format = isThumbnailFormat(settings?.thumbnailFormat) ? settings.thumbnailFormat : "generated";
  const needsAi = format !== "template";
  const openai = needsAi
    ? new OpenAI({ apiKey: await resolveBlogOpenAiKey(blogId), timeout: 120_000, maxRetries: 1 })
    : null;
  const [references, logo] = await Promise.all([
    needsAi ? loadStyleReferences(blogId, settings?.thumbnailReferenceUrls ?? []) : [],
    loadLogo(blogId, settings?.logoUrl),
  ]);

  const cover = await resolveCoverTitle(openai, post);
  const warnings: string[] = [];
  const image = await makeCover(openai, {
    prompt: imageSubject("cover", post), style: settings?.thumbnailStyle, references, runId: "cover-refresh",
    format, colors: thumbnailColors(settings?.thumbnailColors), typography: coverTypography(settings?.thumbnailTypography),
    title: cover.title, blogName: blog.name, warnings,
    logo: logo && isLogoPosition(settings?.thumbnailLogoPosition) ? { bytes: logo, position: settings.thumbnailLogoPosition } : null,
  });

  const uploaded = await uploadBlogImage(blogId, image.bytes, image.mimeType);
  await prisma.$transaction([
    prisma.mediaAsset.create({ data: {
      blogId, postId: post.id, kind: "cover", origin: image.origin, url: uploaded.url,
      prompt: image.prompt, revisedPrompt: image.revisedPrompt ?? null,
      altText: `Cover image for ${post.title}`, mimeType: uploaded.mimeType, byteSize: uploaded.size,
      sha256: createHash("sha256").update(image.bytes).digest("hex"),
      provider: image.model ? "openai" : "zenex", model: image.model,
    } }),
    prisma.post.update({ where: { id: post.id }, data: {
      coverImage: uploaded.url,
      // A headline written here is kept, so the next refresh costs nothing extra.
      ...(cover.written ? { coverTitle: cover.written } : {}),
    } }),
  ]);
  return { url: uploaded.url, warnings };
}

/**
 * Hands one article's cover to a worker. QStash spreads the work and retries;
 * without it (local development) the covers are drawn in this server after the
 * response, one message at a time.
 */
async function dispatchCoverRefresh(blogId: string, postId: string) {
  if (process.env.NODE_ENV === "production" && isQStashConfigured()) {
    await getQStashClient().publishJSON({
      url: `${getQStashDestinationBaseUrl()}${REFRESH_THUMBNAIL_PATH}`,
      body: { blogId, postId },
      retries: COVER_REFRESH_RETRIES,
    });
    return "queue" as const;
  }
  const work = () => refreshPostCover(blogId, postId).catch((error) => {
    console.error("[Growth] cover-refresh-failed", { postId, error: error instanceof Error ? error.message : String(error) });
  });
  try { after(work); } catch { void work(); }
  return "background" as const;
}

/**
 * Queues a redraw of every refreshable cover of a blog and returns at once;
 * each article's cover changes as its own message is delivered.
 */
export async function queueCoverRefresh(blogId: string) {
  const postIds = await refreshableCoverPostIds(blogId);
  if (!postIds.length) return { queued: 0, failed: 0, delivery: "none" as const };

  let queued = 0;
  let failed = 0;
  let delivery: "queue" | "background" | "none" = "none";
  for (const postId of postIds) {
    try {
      delivery = await dispatchCoverRefresh(blogId, postId);
      queued += 1;
    } catch (error) {
      failed += 1;
      console.error("[Growth] cover-refresh-enqueue-failed", { postId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { queued, failed, delivery };
}
