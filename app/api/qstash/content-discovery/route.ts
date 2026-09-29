import { NextResponse } from "next/server";
import { verifyScheduledRequest } from "@/lib/qstash";
import { runDueContentDiscoveries } from "@/src/server/services/growth/discovery";

export const maxDuration = 300;

/**
 * Hourly QStash sweep. Per-blog nextDiscoveryAt controls the actual weekly or
 * monthly cadence. Runs only create reviewable plan ideas.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!await verifyScheduledRequest(request, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    return NextResponse.json({ handled: true, ...await runDueContentDiscoveries(3) });
  } catch (error) {
    console.error("[Growth] discovery-sweep-failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Content discovery failed" }, { status: 500 });
  }
}
