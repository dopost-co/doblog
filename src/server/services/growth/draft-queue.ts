import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { GENERATE_DRAFT_PATH, getQStashClient, getQStashDestinationBaseUrl, isQStashConfigured } from "@/lib/qstash";
import { claimContentPlanDraft, processDraftRun } from "./service";

/** Deliveries after the first one; QStash backs off between them. */
export const DRAFT_RETRIES = 3;
/** Runs waiting longer than this were never delivered (or their worker died) and are sent again. */
const REDISPATCH_AFTER_MS = 15 * 60_000;

/**
 * Hands a run to a worker so writing never blocks the request that asked for
 * it. QStash delivers it to /api/qstash/generate-draft with retries; without
 * QStash (local development) it runs in this server after the response.
 */
export async function dispatchDraftRun(runId: string) {
  // A local .env may point QStash at the production URL, whose worker cannot
  // see local runs, so outside production drafts always run in this server.
  if (process.env.NODE_ENV === "production" && isQStashConfigured()) {
    try {
      await getQStashClient().publishJSON({
        url: `${getQStashDestinationBaseUrl()}${GENERATE_DRAFT_PATH}`,
        body: { runId },
        retries: DRAFT_RETRIES,
      });
      return "queue" as const;
    } catch (error) {
      console.error("[Growth] draft-enqueue-failed", { runId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const work = () => processDraftRun(runId, { finalAttempt: true }).catch((error) => {
    console.error("[Growth] draft-failed", { runId, error: error instanceof Error ? error.message : String(error) });
  });
  try { after(work); } catch { void work(); }
  return "background" as const;
}

/** Queues writing for a plan item and returns at once; the item shows its progress. */
export async function queueContentPlanDraft(blogId: string, itemId: string, trigger: string) {
  const claimed = await claimContentPlanDraft(blogId, itemId, trigger, { queued: true });
  const delivery = await dispatchDraftRun(claimed.run.id);
  return { runId: claimed.run.id, delivery };
}

/** Sends again the runs that never started or whose worker stopped responding. */
export async function redispatchStuckDraftRuns(limit = 10) {
  const before = new Date(Date.now() - REDISPATCH_AFTER_MS);
  const stuck = await prisma.generationRun.findMany({
    where: {
      planItem: { status: "generating" },
      OR: [{ status: "queued", createdAt: { lt: before } }, { status: "running", startedAt: { lt: before } }],
    },
    orderBy: { createdAt: "asc" }, take: limit, select: { id: true },
  });
  for (const run of stuck) await dispatchDraftRun(run.id);
  return { redispatched: stuck.length };
}
