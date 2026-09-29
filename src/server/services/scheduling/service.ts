import { prisma } from "@/lib/prisma";
import {
  PUBLISH_SCHEDULED_PATH,
  getQStashClient,
  getQStashDestinationBaseUrl,
  isQStashConfigured,
} from "@/lib/qstash";
import { invalidateContent } from "@/src/server/services/content/cache";

/** Scheduling can race a callback that fires in the same second, so allow a small skew. */
const DUE_SKEW_MS = 5_000;

async function cancelMessage(messageId: string) {
  try {
    await getQStashClient().messages.delete(messageId);
  } catch (error) {
    // Already delivered or deleted messages are harmless: callbacks are idempotent.
    console.warn("[Scheduling] cancel-failed", { messageId, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Makes the queue match the post's current state. Called after every write
 * that can change status/publishedAt. Never throws: if QStash is unavailable,
 * the periodic sweep still publishes the post on time (within its interval).
 */
export async function syncPostSchedule(postId: string, previousMessageId: string | null) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true, publishedAt: true, scheduleMessageId: true },
  });
  const shouldSchedule = post?.status === "scheduled" && post.publishedAt;
  const staleMessageIds = new Set([previousMessageId, post?.scheduleMessageId].filter((id): id is string => Boolean(id)));

  if (!isQStashConfigured()) {
    if (post?.scheduleMessageId) await prisma.post.update({ where: { id: postId }, data: { scheduleMessageId: null } });
    return;
  }

  let messageId: string | null = null;
  if (shouldSchedule && post.publishedAt) {
    try {
      const result = await getQStashClient().publishJSON({
        url: `${getQStashDestinationBaseUrl()}${PUBLISH_SCHEDULED_PATH}`,
        body: { postId: post.id },
        notBefore: Math.floor(post.publishedAt.getTime() / 1000),
        retries: 5,
      });
      messageId = result.messageId;
      staleMessageIds.delete(messageId);
    } catch (error) {
      console.error("[Scheduling] enqueue-failed", { postId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Only store the message if the post is still scheduled for the same instant.
  if (post) {
    await prisma.post.updateMany({
      where: { id: post.id, status: post.status, publishedAt: post.publishedAt },
      data: { scheduleMessageId: messageId },
    });
  }
  await Promise.all([...staleMessageIds].map(cancelMessage));
}

export async function cancelPostSchedule(messageId: string | null | undefined) {
  if (messageId && isQStashConfigured()) await cancelMessage(messageId);
}

/**
 * Publishes every scheduled post whose time has come. Idempotent and safe to
 * run concurrently: a post is only published while it is still scheduled for
 * a due instant, so rescheduled or unscheduled posts are never affected by a
 * stale queue message.
 */
export async function publishDueScheduledPosts(options: { blogId?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const due = await prisma.post.findMany({
    where: {
      status: "scheduled",
      publishedAt: { lte: new Date(now.getTime() + DUE_SKEW_MS) },
      ...(options.blogId ? { blogId: options.blogId } : {}),
    },
    select: { id: true, blogId: true, publishedAt: true, blog: { select: { blogId: true } } },
    take: 500,
  });

  const published: typeof due = [];
  for (const post of due) {
    const updated = await prisma.post.updateMany({
      where: { id: post.id, status: "scheduled", publishedAt: post.publishedAt },
      data: { status: "published", scheduleMessageId: null },
    });
    if (updated.count === 1) published.push(post);
  }

  const blogs = new Map(published.map((post) => [post.blogId, post.blog.blogId]));
  for (const [blogId, publicBlogId] of blogs) invalidateContent({ blogId, publicBlogId });
  return { checked: due.length, published: published.map((post) => post.id) };
}
