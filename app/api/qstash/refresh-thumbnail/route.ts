import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyScheduledRequest } from "@/lib/qstash";
import { COVER_REFRESH_RETRIES, refreshPostCover } from "@/src/server/services/growth/cover-refresh";

export const maxDuration = 300;

const payloadSchema = z.object({
  blogId: z.string().min(1).max(128),
  postId: z.string().min(1).max(128),
});

/**
 * QStash worker that redraws one article's cover with the blog's saved
 * thumbnail settings. A 5xx asks QStash to deliver it again; a last attempt is
 * reported as handled so one unredrawable article cannot hold up the rest.
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

  const { blogId, postId } = parsed.data;
  const retried = Number(request.headers.get("upstash-retried") ?? 0);
  try {
    const result = await refreshPostCover(blogId, postId);
    return NextResponse.json({ handled: true, url: result.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (retried < COVER_REFRESH_RETRIES) {
      console.warn("[Growth] cover-refresh-retry", { postId, retried, error: message });
      return NextResponse.json({ error: "Retrying" }, { status: 503 });
    }
    console.error("[Growth] cover-refresh-failed", { postId, error: message });
    return NextResponse.json({ handled: true, failed: true });
  }
}
