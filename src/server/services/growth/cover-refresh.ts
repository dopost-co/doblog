import { createHash } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { isLogoPosition } from "@/lib/autopilot/logo";
import { coverTypography, isThumbnailFormat, thumbnailColors, type ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { REFRESH_THUMBNAIL_PATH, getQStashClient, getQStashDestinationBaseUrl, isQStashConfigured } from "@/lib/qstash";
import { blogOpenAI } from "@/src/server/services/usage/openai";
import { uploadBlogImage } from "@/src/server/services/media/upload";
import { resolveCoverTitle } from "./cover-title";
import { LOGO_MISSING, loadCoverIllustration, loadLogo, loadStyleReferences, uploadCoverIllustration } from "./image-references";
import { imageSubject } from "./image-subject";
import { imageSize } from "@/lib/autopilot/image-sizes";
import { makeCover, type CoverIllustration, type MadeImage } from "./images";

/** Deliveries after the first one; QStash backs off between them. */
export const COVER_REFRESH_RETRIES = 2;
/**
 * Most covers one request queues. Each one spends an image generation, so a
 * larger blog is refreshed in several passes rather than in one unbounded bill.
 */
export const COVER_REFRESH_LIMIT = 200;

export type CoverRefreshScope = {
  /** Also draw a first cover for articles that have no image at all. */
  includeMissing?: boolean;
  /** Also replace covers set by hand (uploaded or an outside URL). */
  includeManual?: boolean;
  limit?: number;
};

type CoverPost = { id: string; coverImage: string | null; translationGroupId: string | null };
const groupKey = (post: CoverPost) => post.translationGroupId ?? post.id;

/** Which of these cover URLs are covers this blog drew, whichever language they were drawn for. */
async function drawnCoverUrls(blogId: string, urls: (string | null)[]) {
  const wanted = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  if (!wanted.length) return new Set<string>();
  const assets = await prisma.mediaAsset.findMany({ where: { blogId, kind: "cover", url: { in: wanted } }, select: { url: true } });
  return new Set(assets.map((asset) => asset.url));
}

/**
 * The articles a redraw would cover, newest first: one post per article, as
 * its translations share one cover (see refreshPostCover).
 *
 * A cover counts as drawn here when it is a cover this blog generated, even if
 * it was drawn for another language of the article (translations copy it). By
 * default a cover uploaded by hand or pointed at an outside URL is never
 * touched. With `includeManual`, those are replaced too. With
 * `includeMissing`, articles with no cover at all are added, which is how a
 * blog that has never generated one gets its first.
 */
export async function refreshableCoverPostIds(
  blogId: string,
  { includeMissing = false, includeManual = false, limit = COVER_REFRESH_LIMIT }: CoverRefreshScope = {},
) {
  const posts = await prisma.post.findMany({
    where: { blogId, ...(includeMissing ? {} : { coverImage: { not: null } }) },
    orderBy: { createdAt: "desc" },
    select: { id: true, coverImage: true, translationGroupId: true },
  });
  const drawn = await drawnCoverUrls(blogId, posts.map((post) => post.coverImage));
  const qualifies = (post: CoverPost) =>
    post.coverImage ? drawn.has(post.coverImage) || includeManual : includeMissing;

  // Per article: the post to draw from, preferring one whose cover was drawn here.
  const picked = new Map<string, CoverPost>();
  for (const post of posts) {
    if (!qualifies(post)) continue;
    const key = groupKey(post);
    const current = picked.get(key);
    if (!current || (!(current.coverImage && drawn.has(current.coverImage)) && post.coverImage && drawn.has(post.coverImage))) picked.set(key, post);
  }
  return [...picked.values()].slice(0, limit).map((post) => post.id);
}

/** How many articles a redraw would cover right now, for the confirmation. */
export async function countRefreshableCovers(blogId: string, scope: CoverRefreshScope = {}) {
  return (await refreshableCoverPostIds(blogId, scope)).length;
}

async function coverSetup(blogId: string, format: ThumbnailFormat, purpose: "cover_refresh" | "cover_localize") {
  const settings = await prisma.blogSeoSettings.findUnique({ where: { blogId } });
  const needsAi = purpose === "cover_refresh" && format !== "template";
  const openai = needsAi ? await blogOpenAI(blogId, "cover_refresh", { timeout: 120_000, maxRetries: 1 }) : null;
  const [references, logo] = await Promise.all([
    needsAi ? loadStyleReferences(blogId, settings?.thumbnailReferenceUrls ?? []) : [],
    loadLogo(blogId, settings?.logoUrl),
  ]);
  const warnings: string[] = [];
  if (settings?.logoUrl && settings.thumbnailLogoPosition !== "none" && !logo) warnings.push(LOGO_MISSING);
  return {
    openai, warnings,
    base: {
      style: settings?.thumbnailStyle, references, format,
      colors: thumbnailColors(settings?.thumbnailColors), typography: coverTypography(settings?.thumbnailTypography),
      logo: logo && isLogoPosition(settings?.thumbnailLogoPosition) ? { bytes: logo, position: settings.thumbnailLogoPosition } : null,
      size: imageSize(settings?.thumbnailSize),
    },
  };
}

async function blogThumbnailFormat(blogId: string): Promise<ThumbnailFormat> {
  const settings = await prisma.blogSeoSettings.findUnique({ where: { blogId }, select: { thumbnailFormat: true } });
  return isThumbnailFormat(settings?.thumbnailFormat) ? settings.thumbnailFormat : "generated";
}

/** Uploads a cover, records it as the post's media asset and points the post at it. */
async function storeCover(blogId: string, post: { id: string; title: string }, image: MadeImage, extra: { illustrationUrl?: string | null; coverTitle?: string | null } = {}) {
  const uploaded = await uploadBlogImage(blogId, image.bytes, image.mimeType);
  await prisma.mediaAsset.create({ data: {
    blogId, postId: post.id, kind: "cover", origin: image.origin, url: uploaded.url,
    prompt: image.prompt, revisedPrompt: image.revisedPrompt ?? null,
    altText: `Cover image for ${post.title}`, mimeType: uploaded.mimeType, byteSize: uploaded.size,
    sha256: createHash("sha256").update(image.bytes).digest("hex"),
    provider: image.model ? "openai" : "zenex", model: image.model, illustrationUrl: extra.illustrationUrl ?? null,
  } });
  return uploaded.url;
}

/** Stores a brand card's illustration so other languages can reuse it; null if storing fails. */
async function keepIllustration(blogId: string, illustration: CoverIllustration | null, warnings: string[]) {
  if (!illustration) return null;
  try {
    return await uploadCoverIllustration(blogId, illustration.bytes, illustration.mimeType);
  } catch (error) {
    warnings.push(`The illustration could not be kept for translations: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

/**
 * Redraws an article's cover with the blog's saved thumbnail settings, for
 * every language at once. An AI image has no text, so all languages get the
 * very same image; a brand card is drawn once per language with that
 * language's headline over one shared illustration.
 *
 * Translations whose cover was set by hand keep it unless `includeManual`; the
 * post asked for is always redrawn.
 */
export async function refreshPostCover(blogId: string, postId: string, { includeManual = false }: { includeManual?: boolean } = {}) {
  const post = await prisma.post.findFirst({ where: { id: postId, blogId }, select: postFields });
  if (!post) throw new ApiError(404, "Article not found");
  const siblings = post.translationGroupId
    ? await prisma.post.findMany({ where: { blogId, translationGroupId: post.translationGroupId, id: { not: post.id } }, select: postFields })
    : [];
  const drawn = await drawnCoverUrls(blogId, [post.coverImage, ...siblings.map((sibling) => sibling.coverImage)]);
  const members = [post, ...siblings.filter((sibling) =>
    !sibling.coverImage || sibling.coverImage === post.coverImage || drawn.has(sibling.coverImage) || includeManual)];

  const format = await blogThumbnailFormat(blogId);
  const { openai, warnings, base } = await coverSetup(blogId, format, "cover_refresh");
  const prompt = imageSubject("cover", post);

  if (format === "generated") {
    const image = await makeCover(openai, { ...base, prompt, runId: "cover-refresh", title: post.title, warnings });
    const url = await storeCover(blogId, post, image);
    await prisma.post.updateMany({ where: { id: { in: members.map((member) => member.id) } }, data: { coverImage: url } });
    return { url, coverTitle: null, warnings };
  }

  let illustration: CoverIllustration | null | undefined;
  let illustrationUrl: string | null = null;
  let result = { url: "", coverTitle: null as string | null };
  for (const member of members) {
    const cover = await resolveCoverTitle(openai, member);
    const image = await makeCover(openai, { ...base, prompt, runId: "cover-refresh", title: cover.title, warnings, illustration });
    if (illustration === undefined) {
      illustration = image.illustration;
      illustrationUrl = await keepIllustration(blogId, illustration, warnings);
    }
    const url = await storeCover(blogId, member, image, { illustrationUrl });
    // A headline written here is kept, so the next refresh costs nothing extra.
    await prisma.post.update({ where: { id: member.id }, data: { coverImage: url, ...(cover.written ? { coverTitle: cover.written } : {}) } });
    if (member.id === post.id) result = { url, coverTitle: cover.written };
  }
  return { ...result, warnings };
}

const postFields = { id: true, title: true, coverTitle: true, excerpt: true, content: true, coverImage: true, translationGroupId: true } as const;

/**
 * Gives each translation its own brand card when it shows a card drawn for
 * another language (translations copy the source's cover): same illustration,
 * the translation's own headline. AI-image covers carry no text and are left
 * shared. No new AI image is made, so this is cheap and safe to repeat.
 */
export async function localizeGroupCovers(blogId: string, translationGroupId: string) {
  const posts = await prisma.post.findMany({ where: { blogId, translationGroupId }, select: postFields });
  const urls = [...new Set(posts.flatMap((post) => post.coverImage ? [post.coverImage] : []))];
  if (!urls.length) return { localized: 0 };
  const cards = await prisma.mediaAsset.findMany({
    where: { blogId, kind: "cover", origin: "template", url: { in: urls } },
    select: { url: true, postId: true, illustrationUrl: true },
  });
  const byUrl = new Map(cards.map((card) => [card.url, card]));
  const pending = posts.filter((post) => {
    const card = post.coverImage ? byUrl.get(post.coverImage) : undefined;
    return card && card.postId !== post.id;
  });
  if (!pending.length) return { localized: 0 };

  const format = await blogThumbnailFormat(blogId);
  const { warnings, base } = await coverSetup(blogId, format === "generated" ? "template" : format, "cover_localize");
  const illustrations = new Map<string, CoverIllustration | null>();
  for (const post of pending) {
    const card = byUrl.get(post.coverImage!)!;
    const key = card.illustrationUrl ?? "";
    if (!illustrations.has(key)) {
      const stored = await loadCoverIllustration(blogId, card.illustrationUrl);
      illustrations.set(key, stored ? { ...stored, prompt: null } : null);
    }
    const illustration = illustrations.get(key) ?? null;
    const cover = await resolveCoverTitle(null, post);
    const image = await makeCover(null, {
      ...base, format: illustration ? "template_illustration" : "template", prompt: "", runId: "cover-localize",
      title: cover.title, warnings, illustration,
    });
    await prisma.post.update({ where: { id: post.id }, data: { coverImage: await storeCover(blogId, post, image, { illustrationUrl: card.illustrationUrl }) } });
  }
  return { localized: pending.length, warnings };
}

/**
 * Hands one article's cover to a worker. QStash spreads the work and retries;
 * without it (local development) the covers are drawn in this server after the
 * response, one message at a time.
 */
async function dispatchCoverRefresh(blogId: string, postId: string, includeManual: boolean) {
  if (process.env.NODE_ENV === "production" && isQStashConfigured()) {
    await getQStashClient().publishJSON({
      url: `${getQStashDestinationBaseUrl()}${REFRESH_THUMBNAIL_PATH}`,
      body: { blogId, postId, includeManual },
      retries: COVER_REFRESH_RETRIES,
    });
    return "queue" as const;
  }
  const work = () => refreshPostCover(blogId, postId, { includeManual }).catch((error) => {
    console.error("[Growth] cover-refresh-failed", { postId, error: error instanceof Error ? error.message : String(error) });
  });
  try { after(work); } catch { void work(); }
  return "background" as const;
}

/**
 * Queues a redraw of every refreshable cover of a blog and returns at once;
 * each article's cover changes as its own message is delivered.
 */
export async function queueCoverRefresh(blogId: string, scope: CoverRefreshScope = {}) {
  const postIds = await refreshableCoverPostIds(blogId, scope);
  if (!postIds.length) return { queued: 0, failed: 0, delivery: "none" as const };

  let queued = 0;
  let failed = 0;
  let delivery: "queue" | "background" | "none" = "none";
  for (const postId of postIds) {
    try {
      delivery = await dispatchCoverRefresh(blogId, postId, Boolean(scope.includeManual));
      queued += 1;
    } catch (error) {
      failed += 1;
      console.error("[Growth] cover-refresh-enqueue-failed", { postId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { queued, failed, delivery };
}
