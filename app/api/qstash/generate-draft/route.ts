import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyScheduledRequest } from "@/lib/qstash";
import { DRAFT_RETRIES } from "@/src/server/services/growth/draft-queue";
import { processDraftRun, RetryableDraftError } from "@/src/server/services/growth/service";

export const maxDuration = 300;

const payloadSchema = z.object({ runId: z.string().min(1).max(128) });

/**
 * QStash worker that writes one queued draft. A 5xx asks QStash to deliver it
 * again (only for failures worth retrying); everything else is final.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!await verifyScheduledRequest(request, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const retried = Number(request.headers.get("upstash-retried") ?? 0);
  try {
    const result = await processDraftRun(parsed.data.runId, { finalAttempt: retried >= DRAFT_RETRIES });
    return NextResponse.json({ handled: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof RetryableDraftError) {
      console.warn("[Growth] draft-retry", { runId: parsed.data.runId, retried, error: message });
      return NextResponse.json({ error: "Retrying" }, { status: 503 });
    }
    console.error("[Growth] draft-failed", { runId: parsed.data.runId, error: message });
    return NextResponse.json({ handled: true, failed: true });
  }
}
