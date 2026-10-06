import { after } from "next/server";
import type { Prisma, PublishDestination } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secrets";
import { copiesArticles } from "@/lib/publishing/platforms";
import type { SiteInfo } from "@/lib/publishing/protocol";
import { articleHref, articlePrefixFor } from "@/src/server/services/growth/internal-links";
import { ARTICLE_SELECT, articleHash, toArticle, type Sibling } from "./article";
import { adapterFor, PublishError, type Adapter, type DestinationContext } from "./adapters";

/**
 * Keeps a site's copies in step with the blog. Zenex is the source of truth:
 * a run compares every published article with its PostPublication and sends
 * only what changed, then removes copies of articles that are no longer
 * published. Runs are idempotent and locked per destination, so they can be
 * triggered from anywhere (every content write, the periodic sweep, a button).
 */

const LOCK_MS = 5 * 60_000;
/** Remote operations per run; the rest continue in the next run. */
const MAX_OPERATIONS = 25;
const RUN_BUDGET_MS = 4 * 60_000;
/** Every published article is compared at least this often, catching renamed categories and the like. */
const FULL_SYNC_EVERY_MS = 6 * 60 * 60_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000];

export function retryDelay(attempts: number) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
}

const configOf = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const infoOf = (value: Prisma.JsonValue | null): SiteInfo => configOf(value ?? null) as SiteInfo;

/** Languages this destination receives. */
export function destinationLanguages(destination: Pick<PublishDestination, "method" | "config" | "siteInfo">, blogLanguages: string[]) {
  const chosen = configOf(destination.config).languages;
  if (Array.isArray(chosen) && chosen.length) return blogLanguages.filter((language) => chosen.includes(language));
  if (destination.method !== "plugin") return blogLanguages;
  const info = infoOf(destination.siteInfo);
  // A site that holds one language gets the main one; mixing languages in one blog hurts it.
  if (!info.multilingual) return blogLanguages.slice(0, 1);
  return info.languages?.length ? blogLanguages.filter((language) => info.languages!.includes(language)) : blogLanguages;
}

type Blog = { id: string; blogId: string; languages: string[]; seoSettings: { articleUrlPrefix: string; articlePaths: Prisma.JsonValue } | null };

export function destinationContext(destination: PublishDestination, blog: Blog): DestinationContext {
  return {
    platform: destination.platform,
    method: destination.method,
    siteUrl: destination.siteUrl,
    config: configOf(destination.config),
    secret: destination.secret ? decryptSecret(destination.secret) : null,
    multilingual: blog.languages.length > 1,
    articleUrl: ({ slug, language }) => {
      const href = articleHref(articlePrefixFor(blog.seoSettings, language), slug);
      if (/^https?:\/\//.test(href)) return href;
      return destination.siteUrl ? `${destination.siteUrl}${href}` : null;
    },
  };
}

const message = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);

/**
 * Marks the blog's destination as needing a sync and runs it after the
 * response. Called from every content write (invalidateContent); cheap when
 * the blog reads from the API or nothing published changed.
 */
export function requestPublishSync(blogId: string) {
  const work = async () => {
    const updated = await prisma.publishDestination.updateMany({
      where: { blogId, status: "connected", method: { not: "api" } },
      data: { syncRequestedAt: new Date() },
    });
    if (updated.count) await runBlogSync(blogId);
  };
  const run = () => work().catch((error) => console.error("[Publishing] request-failed", { blogId, error: message(error) }));
  try { after(run); } catch { void run(); }
}

export async function runBlogSync(blogId: string, options: { full?: boolean } = {}) {
  const destination = await prisma.publishDestination.findUnique({ where: { blogId }, select: { id: true } });
  return destination ? syncDestination(destination.id, options) : null;
}

export type SyncResult = { skipped?: string; sent: number; removed: number; failed: number; remaining: boolean };

/** One locked run; loops while new changes arrive during it. */
export async function syncDestination(destinationId: string, options: { full?: boolean; now?: () => Date } = {}): Promise<SyncResult> {
  const now = options.now ?? (() => new Date());
  const lockedUntil = new Date(now().getTime() + LOCK_MS);
  const locked = await prisma.publishDestination.updateMany({
    where: { id: destinationId, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now() } }] },
    data: { syncLockedUntil: lockedUntil },
  });
  // Another run holds the lock; it picks up syncRequestedAt before releasing it.
  if (!locked.count) return { skipped: "locked", sent: 0, removed: 0, failed: 0, remaining: true };

  const total: SyncResult = { sent: 0, removed: 0, failed: 0, remaining: false };
  const started = now().getTime();
  let full = options.full ?? false;
  try {
    for (let round = 0; round < 5; round++) {
      const roundStart = now();
      const destination = await prisma.publishDestination.findUnique({
        where: { id: destinationId },
        include: { blog: { select: { id: true, blogId: true, languages: true, deletedAt: true, seoSettings: { select: { articleUrlPrefix: true, articlePaths: true } } } } },
      });
      if (!destination || destination.blog.deletedAt) return { ...total, skipped: "missing" };
      if (!copiesArticles(destination.method)) return { ...total, skipped: "api" };
      if (destination.status !== "connected") return { ...total, skipped: "not-connected" };
      if (!full && (!destination.lastFullSyncAt || roundStart.getTime() - destination.lastFullSyncAt.getTime() > FULL_SYNC_EVERY_MS)) full = true;

      const result = await syncRound(destination, full, roundStart, Math.max(0, RUN_BUDGET_MS - (now().getTime() - started)));
      total.sent += result.sent;
      total.removed += result.removed;
      total.failed += result.failed;
      total.remaining = result.remaining;

      const finished = !result.remaining && !result.connectionError;
      await prisma.publishDestination.update({
        where: { id: destinationId },
        data: {
          lastSyncedAt: now(),
          ...(finished && full ? { lastFullSyncAt: roundStart } : {}),
          ...(result.connectionError ? { status: "error", statusMessage: result.connectionError } : {}),
        },
      });
      // Clear the request only if nothing new arrived during this round.
      if (!result.remaining) {
        await prisma.publishDestination.updateMany({ where: { id: destinationId, syncRequestedAt: { lte: roundStart } }, data: { syncRequestedAt: null } });
      }
      if (result.connectionError || result.remaining) break;
      const again = await prisma.publishDestination.findFirst({ where: { id: destinationId, syncRequestedAt: { gt: roundStart } }, select: { id: true } });
      if (!again) break;
      full = false;
    }
  } finally {
    await prisma.publishDestination.updateMany({ where: { id: destinationId, syncLockedUntil: lockedUntil }, data: { syncLockedUntil: null } });
  }
  return total;
}

type Destination = PublishDestination & { blog: Blog };

async function syncRound(destination: Destination, full: boolean, now: Date, budgetMs: number) {
  const result = { sent: 0, removed: 0, failed: 0, remaining: false, connectionError: null as string | null };
  const deadline = Date.now() + budgetMs;
  const context = destinationContext(destination, destination.blog);
  let adapter: Adapter;
  try { adapter = adapterFor(context); }
  catch (error) { result.connectionError = message(error); return result; }

  const languages = destinationLanguages(destination, destination.blog.languages);
  const [posts, publications] = await Promise.all([
    prisma.post.findMany({
      where: { blogId: destination.blogId, status: "published", language: { in: languages } },
      select: { id: true, updatedAt: true },
      orderBy: { publishedAt: "asc" },
    }),
    prisma.postPublication.findMany({ where: { destinationId: destination.id } }),
  ]);
  const byPost = new Map(publications.map((publication) => [publication.postId, publication]));
  const wanted = new Set(posts.map((post) => post.id));
  const due = (publication: { nextAttemptAt: Date | null }) => !publication.nextAttemptAt || publication.nextAttemptAt <= now;

  // Cheap filter first: unchanged posts are only rendered and hashed on a full sync.
  const candidates = posts.filter((post) => {
    const publication = byPost.get(post.id);
    if (!publication) return true;
    if (publication.state === "failed") return due(publication);
    if (publication.state === "pending") return true;
    return full || !publication.sourceUpdatedAt || post.updatedAt > publication.sourceUpdatedAt;
  });
  const stale = publications.filter((publication) => !wanted.has(publication.postId) && (publication.state !== "failed" || due(publication)));

  let operations = 0;
  const outOfBudget = () => operations >= MAX_OPERATIONS || Date.now() > deadline;

  for (let offset = 0; offset < candidates.length && !result.connectionError; offset += 20) {
    if (outOfBudget()) { result.remaining = true; break; }
    const batch = await prisma.post.findMany({ where: { id: { in: candidates.slice(offset, offset + 20).map((post) => post.id) }, status: "published" }, select: ARTICLE_SELECT });
    const groups = [...new Set(batch.map((post) => post.translationGroupId).filter((id): id is string => Boolean(id)))];
    const siblings: Sibling[] = groups.length ? await prisma.post.findMany({
      where: { blogId: destination.blogId, status: "published", language: { in: languages }, translationGroupId: { in: groups } },
      select: { id: true, language: true, slug: true, translationGroupId: true },
    }) : [];

    for (const post of batch) {
      if (outOfBudget()) { result.remaining = true; break; }
      const article = toArticle(post, siblings);
      const hash = articleHash(article, adapter.version);
      const publication = byPost.get(post.id);
      if (publication?.state === "synced" && publication.contentHash === hash) {
        if (!publication.sourceUpdatedAt || publication.sourceUpdatedAt < post.updatedAt) {
          await prisma.postPublication.update({ where: { id: publication.id }, data: { sourceUpdatedAt: post.updatedAt } });
        }
        continue;
      }
      operations++;
      try {
        const sent = await adapter.upsert(article, post, publication?.remoteId ?? null);
        await prisma.postPublication.upsert({
          where: { destinationId_postId: { destinationId: destination.id, postId: post.id } },
          create: {
            destinationId: destination.id, postId: post.id, language: post.language, remoteId: sent.remoteId, remoteUrl: sent.url,
            contentHash: hash, sourceUpdatedAt: post.updatedAt, state: "synced", syncedAt: new Date(),
          },
          update: {
            language: post.language, remoteId: sent.remoteId, remoteUrl: sent.url, contentHash: hash, sourceUpdatedAt: post.updatedAt,
            state: "synced", lastError: null, attempts: 0, nextAttemptAt: null, syncedAt: new Date(),
          },
        });
        result.sent++;
      } catch (error) {
        result.failed++;
        const attempts = (publication?.attempts ?? 0) + 1;
        await prisma.postPublication.upsert({
          where: { destinationId_postId: { destinationId: destination.id, postId: post.id } },
          create: { destinationId: destination.id, postId: post.id, language: post.language, state: "failed", lastError: message(error), attempts, nextAttemptAt: new Date(Date.now() + retryDelay(attempts)) },
          update: { state: "failed", lastError: message(error), attempts, nextAttemptAt: new Date(Date.now() + retryDelay(attempts)) },
        });
        console.warn("[Publishing] upsert-failed", { destinationId: destination.id, postId: post.id, error: message(error) });
        if (error instanceof PublishError && error.options.connection) { result.connectionError = error.message; break; }
      }
    }
  }

  for (const publication of stale) {
    if (result.connectionError) break;
    if (outOfBudget()) { result.remaining = true; break; }
    operations++;
    try {
      if (publication.remoteId) {
        const post = await prisma.post.findUnique({ where: { id: publication.postId }, select: { translationGroupId: true } });
        await adapter.remove({ id: publication.postId, language: publication.language, translationGroupId: post?.translationGroupId ?? null }, publication.remoteId);
      }
      await prisma.postPublication.delete({ where: { id: publication.id } });
      result.removed++;
    } catch (error) {
      result.failed++;
      const attempts = publication.attempts + 1;
      await prisma.postPublication.update({
        where: { id: publication.id },
        data: { state: "failed", lastError: `Removing the copy failed: ${message(error)}`, attempts, nextAttemptAt: new Date(Date.now() + retryDelay(attempts)) },
      });
      if (error instanceof PublishError && error.options.connection) result.connectionError = error.message;
    }
  }
  return result;
}

/**
 * The periodic sweep: destinations with requested work, failed copies whose
 * retry is due, interrupted runs, and the regular full comparison.
 */
export async function syncDueDestinations(now = new Date()) {
  const destinations = await prisma.publishDestination.findMany({
    where: {
      status: "connected",
      method: { not: "api" },
      blog: { deletedAt: null },
      OR: [
        { syncRequestedAt: { not: null } },
        { lastFullSyncAt: null },
        { lastFullSyncAt: { lt: new Date(now.getTime() - FULL_SYNC_EVERY_MS) } },
        { publications: { some: { state: "failed", nextAttemptAt: { lte: now } } } },
      ],
    },
    select: { id: true },
    take: 20,
  });
  const results = [];
  for (const destination of destinations) {
    results.push(await syncDestination(destination.id).catch((error) => ({ skipped: message(error), sent: 0, removed: 0, failed: 0, remaining: true })));
  }
  return { destinations: destinations.length, sent: results.reduce((sum, item) => sum + item.sent, 0), failed: results.reduce((sum, item) => sum + item.failed, 0) };
}
