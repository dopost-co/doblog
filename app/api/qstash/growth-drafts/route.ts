import { NextResponse } from "next/server";
import { verifyScheduledRequest } from "@/lib/qstash";
import { runDueDraftGenerations } from "@/src/server/services/growth/draft-scheduler";

export const maxDuration = 300;

/**
 * Hourly sweep for plan items whose visible draft date has arrived. It creates
 * reviewable drafts only; publishing remains a separate editorial action.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!await verifyScheduledRequest(request, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    return NextResponse.json({ handled: true, ...await runDueDraftGenerations() });
  } catch (error) {
    console.error("[Growth] draft-sweep-failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Scheduled draft generation failed" }, { status: 500 });
  }
}
