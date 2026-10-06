import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { copiesArticles, destinationName } from "@/lib/publishing/platforms";
import type { SiteInfo } from "@/lib/publishing/protocol";
import { githubConfig } from "./adapters";
import { destinationLanguages } from "./sync";

const configOf = (value: Prisma.JsonValue | null) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export type WebsiteState = Awaited<ReturnType<typeof getWebsiteState>>;

/** Everything Settings → Web integration shows. Secrets never leave the server here. */
export async function getWebsiteState(blogId: string) {
  const blog = await prisma.blog.findUniqueOrThrow({
    where: { id: blogId },
    select: { id: true, blogId: true, languages: true, seoSettings: { select: { targetDomain: true } } },
  });
  const destination = await prisma.publishDestination.findUnique({ where: { blogId } });
  const website = blog.seoSettings?.targetDomain ?? null;
  if (!destination) return { blogId, publicBlogId: blog.blogId, website, blogLanguages: blog.languages, destination: null };

  const config = configOf(destination.config);
  const info = configOf(destination.siteInfo) as SiteInfo;
  const languages = destinationLanguages(destination, blog.languages);
  const pushes = copiesArticles(destination.method);
  const [published, publications] = pushes ? await Promise.all([
    prisma.post.findMany({ where: { blogId, status: "published", language: { in: languages } }, select: { id: true, title: true, language: true } }),
    prisma.postPublication.findMany({
      where: { destinationId: destination.id },
      select: { postId: true, state: true, lastError: true, nextAttemptAt: true, remoteUrl: true, syncedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]) : [[], []];

  const titles = new Map(published.map((post) => [post.id, post.title]));
  const byPost = new Map(publications.map((publication) => [publication.postId, publication]));
  const synced = published.filter((post) => byPost.get(post.id)?.state === "synced").length;
  const failures = publications.filter((publication) => publication.state === "failed").slice(0, 20).map((publication) => ({
    postId: publication.postId,
    title: titles.get(publication.postId) ?? "A removed article",
    error: publication.lastError ?? "Unknown error",
    nextAttemptAt: publication.nextAttemptAt?.toISOString() ?? null,
  }));
  const recent = publications.filter((publication) => publication.state === "synced" && publication.remoteUrl && titles.has(publication.postId))
    .slice(0, 5)
    .map((publication) => ({ postId: publication.postId, title: titles.get(publication.postId)!, url: publication.remoteUrl!, syncedAt: publication.syncedAt?.toISOString() ?? null }));
  const github = destination.method === "github" ? githubConfig(config) : null;

  return {
    blogId,
    publicBlogId: blog.blogId,
    website,
    blogLanguages: blog.languages,
    destination: {
      platform: destination.platform,
      method: destination.method,
      siteUrl: destination.siteUrl,
      status: destination.status,
      statusMessage: destination.statusMessage,
      hasSecret: Boolean(destination.secret),
      endpoint: typeof config.endpoint === "string" ? config.endpoint : null,
      github: github && { repo: github.repo, branch: github.branch, contentDir: github.contentDir, imagesDir: github.imagesDir, imagesPath: github.imagesPath },
      info: {
        name: info.name ?? null,
        platformVersion: info.platformVersion ?? null,
        connectorVersion: info.connectorVersion ?? null,
        multilingual: info.multilingual ?? null,
        seoPlugin: info.seoPlugin ?? null,
      },
      languages,
      lastCheckedAt: destination.lastCheckedAt?.toISOString() ?? null,
      lastSyncedAt: destination.lastSyncedAt?.toISOString() ?? null,
      syncing: Boolean(destination.syncRequestedAt) || Boolean(destination.syncLockedUntil && destination.syncLockedUntil > new Date()),
    },
    counts: { published: published.length, synced, failed: failures.length, waiting: Math.max(0, published.length - synced - failures.filter((failure) => titles.has(failure.postId)).length) },
    failures,
    recent,
  };
}

/** Where each listed post's copy stands, for the posts list and the editor. */
export async function getPublicationStates(blogId: string, postIds: string[]) {
  if (!postIds.length) return { destination: null, states: {} as Record<string, { state: string; url: string | null; error: string | null }> };
  const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { id: true, platform: true, method: true, status: true } });
  if (!destination || !copiesArticles(destination.method)) return { destination: null, states: {} };
  const rows = await prisma.postPublication.findMany({ where: { destinationId: destination.id, postId: { in: postIds } }, select: { postId: true, state: true, remoteUrl: true, lastError: true } });
  return {
    destination: { platform: destination.platform, method: destination.method, connected: destination.status === "connected" },
    states: Object.fromEntries(rows.map((row) => [row.postId, { state: row.state, url: row.remoteUrl, error: row.lastError }])),
  };
}

/** The name of the connected website articles are copied to ("WordPress", "GitHub"), or null. */
export async function getCopySite(blogId: string) {
  const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { platform: true, method: true, status: true } });
  return destination && copiesArticles(destination.method) && destination.status === "connected" ? destinationName(destination) : null;
}
