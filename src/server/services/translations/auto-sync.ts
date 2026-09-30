import { after } from "next/server";
import type { Post } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncTranslationGroup, translatableTextChanged } from "./post-translation";

/** Saves in quick succession (e.g. several edits) only translate once, after the last one. */
const SYNC_DELAY_MS = 10_000;

/**
 * Runs after a post is created or updated by the user, the API, MCP or
 * Autopilot (never by a sync itself, so syncs cannot trigger each other).
 * When the blog keeps translations in sync, it flags text changes and syncs
 * the post's translation group in the background once the response is sent.
 */
export async function queueTranslationSync(blogId: string, previous: Post | null, post: Post) {
  try {
    const blog = await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null }, select: { autoSyncTranslations: true } });
    if (!blog?.autoSyncTranslations) return;

    const current = !previous || translatableTextChanged(previous, post)
      ? await prisma.post.update({ where: { id: post.id }, data: { translationSyncPending: true }, select: { updatedAt: true } })
      : post;
    const version = current.updatedAt.toISOString();

    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY_MS));
      const result = await syncTranslationGroup(post.id, version);
      if (!result.skipped) console.log("[Translations] synced", { postId: post.id, updated: result.updated, created: result.created, failed: result.failed?.length ?? 0 });
    };
    const background = () => run().catch((error) => {
      console.error("[Translations] sync-error", { postId: post.id, error: error instanceof Error ? error.message : String(error) });
    });
    // Outside a request (scripts, tests) there is no response to wait for.
    try { after(background); } catch { void background(); }
  } catch (error) {
    // Syncing translations must never make the write itself fail.
    console.error("[Translations] queue-failed", { postId: post.id, error: error instanceof Error ? error.message : String(error) });
  }
}
