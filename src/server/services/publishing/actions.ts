"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { fixedMethod, isDeliveryMethod, isSitePlatform, type DeliveryMethod, type SitePlatform } from "@/lib/publishing/platforms";
import { generateSigningKey, type SiteInfo } from "@/lib/publishing/protocol";
import { requireBlogPermission } from "@/src/server/services/blogs/access";
import { normalizeArticlePath } from "@/src/server/services/growth/internal-links";
import { adapterFor, githubConfig, normalizeEndpoint, normalizeSiteUrl, PublishError } from "./adapters";
import { destinationContext, runBlogSync } from "./sync";
import { getWebsiteState } from "./queries";

const idSchema = z.string().min(1).max(128);

const paths = (blogId: string) => {
  revalidatePath(`/dashboard/blogs/${blogId}/settings/web-integration`);
  revalidatePath(`/dashboard/blogs/${blogId}`, "layout");
};

const configOf = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Runs a full sync after the response, so the page answers right away. */
function syncLater(blogId: string) {
  const work = () => runBlogSync(blogId, { full: true }).catch((error) => console.error("[Publishing] sync-failed", { blogId, error: error instanceof Error ? error.message : String(error) }));
  try { after(work); } catch { void work(); }
}

/**
 * Records where the blog's articles live. Choosing something else starts over:
 * the old connection is dropped (copies already on the old site stay there).
 */
export async function saveSitePlatform(blogId: string, platform: string, method?: string | null) {
  await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
  if (!isSitePlatform(platform)) throw new ApiError(400, "Choose the kind of website you have");
  const chosen: DeliveryMethod | null = fixedMethod(platform) ?? (method && isDeliveryMethod(method, platform) ? method : null);
  const current = await prisma.publishDestination.findUnique({ where: { blogId }, select: { id: true, platform: true, method: true } });
  // A site built in code without a method yet keeps the platform and asks next.
  const nextMethod = chosen ?? (current?.platform === platform ? current.method : "api");
  if (current && current.platform === platform && current.method === nextMethod) return { platform, method: nextMethod };

  const website = await prisma.blogSeoSettings.findUnique({ where: { blogId }, select: { targetDomain: true } });
  const siteUrl = website?.targetDomain ? `https://${website.targetDomain}` : null;
  const needsKey = nextMethod === "plugin" || nextMethod === "webhook";
  const fresh = {
    platform, method: nextMethod, siteUrl, config: {}, secret: needsKey ? encryptSecret(generateSigningKey()) : null,
    status: nextMethod === "api" ? "connected" : "pending", statusMessage: null, siteInfo: Prisma.DbNull,
    lastCheckedAt: null, syncRequestedAt: null, syncLockedUntil: null, lastSyncedAt: null, lastFullSyncAt: null,
  };
  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.postPublication.deleteMany({ where: { destinationId: current.id } });
      await tx.publishDestination.update({ where: { id: current.id }, data: fresh });
    } else {
      await tx.publishDestination.create({ data: { blogId, ...fresh } });
    }
  });
  return { platform, method: nextMethod };
}

export async function chooseSitePlatform(blogId: string, platform: SitePlatform, method?: DeliveryMethod | null) {
  try {
    const result = await saveSitePlatform(blogId, platform, method);
    paths(blogId);
    return result;
  } catch (error) { return { error: apiError(error).error }; }
}

/** What the onboarding's connect step needs to show the same panel as Settings → Web integration. */
export async function connectionForSetup(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    const state = await getWebsiteState(blogId);
    const destination = state.destination;
    if (!destination) return { destination: null, website: state.website };
    return {
      website: state.website,
      destination: {
        platform: destination.platform, method: destination.method, siteUrl: destination.siteUrl, status: destination.status,
        statusMessage: destination.statusMessage, endpoint: destination.endpoint, github: destination.github,
      },
    };
  } catch (error) { return { error: apiError(error).error }; }
}

/** The key to paste in the plugin or use to verify webhooks. Shown to admins only. */
export async function revealSigningKey(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { secret: true, method: true } });
    if (!destination || !["plugin", "webhook"].includes(destination.method)) throw new ApiError(404, "This blog has no connection key");
    if (!destination.secret) {
      const key = generateSigningKey();
      await prisma.publishDestination.update({ where: { blogId }, data: { secret: encryptSecret(key) } });
      return { key };
    }
    return { key: decryptSecret(destination.secret) };
  } catch (error) { return { error: apiError(error).error }; }
}

/** A new key; the site stops accepting articles until it gets the new one. */
export async function rotateSigningKey(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    const key = generateSigningKey();
    const updated = await prisma.publishDestination.updateMany({
      where: { blogId, method: { in: ["plugin", "webhook"] } },
      data: { secret: encryptSecret(key), status: "pending", statusMessage: "Paste the new key on your site, then check the connection." },
    });
    if (!updated.count) throw new ApiError(404, "This blog has no connection key");
    paths(blogId);
    return { key };
  } catch (error) { return { error: apiError(error).error }; }
}

const connectSchema = z.object({
  siteUrl: z.string().trim().max(2048).optional(),
  endpoint: z.string().trim().max(2048).optional(),
  token: z.string().trim().max(400).optional(),
  repo: z.string().trim().max(200).optional(),
  branch: z.string().trim().max(200).optional(),
  contentDir: z.string().trim().max(300).optional(),
  imagesDir: z.string().trim().max(300).optional(),
  imagesPath: z.string().trim().max(300).optional(),
}).strict();

/** Article paths the site reported, stored per language so links between articles point at the real pages. */
function articlePathsFrom(info: SiteInfo, siteUrl: string | null, languages: string[]) {
  const found: Record<string, string> = {};
  for (const language of languages) {
    const base = info.articleBase?.[language];
    if (typeof base !== "string") continue;
    try {
      const url = new URL(base);
      const sameHost = siteUrl && new URL(siteUrl).host === url.host;
      found[language] = normalizeArticlePath(sameHost ? url.pathname : base);
    } catch { /* unusable */ }
  }
  return found;
}

/**
 * Saves the connection details, checks that the site answers and, when it
 * does, marks the destination connected and copies every published article.
 */
export async function connectDestination(blogId: string, input: unknown) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    const data = connectSchema.parse(input);
    const destination = await prisma.publishDestination.findUnique({ where: { blogId } });
    if (!destination) throw new ApiError(404, "Choose your website first");
    if (destination.method === "api") throw new ApiError(400, "This blog reads articles from the API; there is nothing to connect");

    const config = configOf(destination.config);
    let siteUrl = destination.siteUrl;
    let secret = destination.secret;
    if (data.siteUrl !== undefined) siteUrl = data.siteUrl ? normalizeSiteUrl(data.siteUrl) : null;
    if (destination.method === "webhook") {
      if (!data.endpoint && typeof config.endpoint !== "string") throw new ApiError(400, "Enter the endpoint that receives the articles");
      if (data.endpoint) config.endpoint = normalizeEndpoint(data.endpoint);
    }
    if (destination.method === "github") {
      if (data.token) secret = encryptSecret(data.token);
      if (!secret) throw new ApiError(400, "Paste a GitHub access token");
      Object.assign(config, githubConfig({ ...config, ...Object.fromEntries(Object.entries(data).filter(([key, value]) => ["repo", "branch", "contentDir", "imagesDir", "imagesPath"].includes(key) && value)) }));
    }
    if (destination.method === "plugin" && !siteUrl) throw new ApiError(400, "Enter your website address");

    const blog = await prisma.blog.findUniqueOrThrow({ where: { id: blogId }, select: { id: true, blogId: true, languages: true, seoSettings: { select: { articleUrlPrefix: true, articlePaths: true } } } });
    const candidate = { ...destination, siteUrl, secret, config: config as Prisma.JsonValue };
    let checked: Awaited<ReturnType<ReturnType<typeof adapterFor>["check"]>>;
    try {
      checked = await adapterFor(destinationContext(candidate, blog)).check();
    } catch (error) {
      const reason = error instanceof PublishError || error instanceof ApiError ? error.message : "The check failed unexpectedly";
      if (!(error instanceof PublishError)) console.error("[Publishing] check-failed", { blogId, error: error instanceof Error ? error.message : String(error) });
      await prisma.publishDestination.update({
        where: { id: destination.id },
        data: { siteUrl, secret, config: config as Prisma.InputJsonValue, status: destination.status === "connected" ? "error" : "pending", statusMessage: reason, lastCheckedAt: new Date() },
      });
      paths(blogId);
      return { error: reason };
    }

    const info = checked.info;
    await prisma.publishDestination.update({
      where: { id: destination.id },
      data: {
        siteUrl: siteUrl ?? (info.url ? normalizeSiteUrl(info.url) : null), secret,
        config: { ...config, ...checked.config } as Prisma.InputJsonValue,
        siteInfo: info as Prisma.InputJsonValue, status: "connected", statusMessage: null, lastCheckedAt: new Date(),
        syncRequestedAt: new Date(),
      },
    });
    // Failed copies get a fresh chance now that the connection works.
    await prisma.postPublication.updateMany({ where: { destinationId: destination.id, state: "failed" }, data: { nextAttemptAt: null } });
    const articlePaths = articlePathsFrom(info, siteUrl, blog.languages);
    if (Object.keys(articlePaths).length) {
      const existing = configOf(blog.seoSettings?.articlePaths ?? null);
      await prisma.blogSeoSettings.upsert({
        where: { blogId },
        create: { blogId, articlePaths },
        update: { articlePaths: { ...existing, ...articlePaths } as Prisma.InputJsonValue },
      });
    }
    syncLater(blogId);
    paths(blogId);
    return { connected: true, info };
  } catch (error) { return { error: apiError(error).error }; }
}

/** Sends everything that is out of date now. */
export async function syncDestinationNow(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "content.write");
    const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { status: true, method: true } });
    if (!destination || destination.method === "api") throw new ApiError(404, "This blog doesn’t copy articles to a website");
    if (destination.status !== "connected") throw new ApiError(409, "Check the connection first");
    await prisma.postPublication.updateMany({ where: { destination: { blogId }, state: "failed" }, data: { nextAttemptAt: null } });
    syncLater(blogId);
    paths(blogId);
    return { started: true };
  } catch (error) { return { error: apiError(error).error }; }
}

/** Sends every article again, e.g. after posts were deleted on the site by hand. */
export async function resendAllArticles(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { id: true, status: true, method: true } });
    if (!destination || destination.method === "api") throw new ApiError(404, "This blog doesn’t copy articles to a website");
    if (destination.status !== "connected") throw new ApiError(409, "Check the connection first");
    await prisma.postPublication.updateMany({ where: { destinationId: destination.id }, data: { contentHash: null, state: "pending", nextAttemptAt: null, attempts: 0 } });
    syncLater(blogId);
    paths(blogId);
    return { started: true };
  } catch (error) { return { error: apiError(error).error }; }
}

/** Retries one article whose copy failed. */
export async function retryPublication(blogId: string, postId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "content.write");
    await prisma.postPublication.updateMany({ where: { destination: { blogId }, postId: idSchema.parse(postId) }, data: { nextAttemptAt: null } });
    await prisma.publishDestination.updateMany({ where: { blogId }, data: { syncRequestedAt: new Date() } });
    syncLater(blogId);
    paths(blogId);
    return { started: true };
  } catch (error) { return { error: apiError(error).error }; }
}

/** Stops copying articles. Copies already on the site stay there. */
export async function disconnectDestination(blogId: string) {
  try {
    await requireBlogPermission(idSchema.parse(blogId), "integrations.manage");
    await prisma.publishDestination.deleteMany({ where: { blogId } });
    paths(blogId);
    return { disconnected: true };
  } catch (error) { return { error: apiError(error).error }; }
}
