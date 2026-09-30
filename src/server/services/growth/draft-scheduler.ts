import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { queueContentPlanDraft, redispatchStuckDraftRuns } from "./draft-queue";

/**
 * Hourly sweep: queues the plan items whose writing date has arrived (workers
 * write them), and sends again any run that got stuck.
 */
export async function runDueDraftGenerations(limit = 10) {
  const due = await prisma.contentPlanItem.findMany({
    where: {
      status: "planned", postId: null, scheduledFor: { lte: new Date() },
      blog: { seoSettings: { draftAutomationEnabled: true } },
    },
    orderBy: { scheduledFor: "asc" }, take: Math.max(1, Math.min(limit, 25)),
    select: { id: true, blogId: true },
  });
  let queued = 0;
  let failed = 0;
  for (const item of due) {
    try {
      await queueContentPlanDraft(item.blogId, item.id, "scheduler");
      queued += 1;
    } catch (error) {
      // Another sweep or the owner already started it.
      if (!(error instanceof ApiError && error.status === 409)) failed += 1;
    }
  }
  const { redispatched } = await redispatchStuckDraftRuns();
  return { due: due.length, queued, failed, redispatched };
}
