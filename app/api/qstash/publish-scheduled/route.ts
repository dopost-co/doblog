import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyScheduledRequest } from "@/lib/qstash";
import { publishDueScheduledPosts, rearmScheduledPosts, syncPostSchedule } from "@/src/server/services/scheduling/service";

const payloadSchema = z.object({ postId: z.string().min(1).max(128).optional() });

/**
 * QStash callback. With `postId` it publishes the due posts of that post's blog
 * (so translations scheduled for the same time go live together); without it,
 * it sweeps every blog. Both are idempotent, so retries and stale messages are safe.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!await verifyScheduledRequest(request, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    if (body) json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const post = parsed.data.postId
      ? await prisma.post.findUnique({ where: { id: parsed.data.postId }, select: { id: true, blogId: true } })
      : null;
    if (parsed.data.postId && !post) return NextResponse.json({ handled: true, reason: "post-not-found" });
    const result = await publishDueScheduledPosts({ blogId: post?.blogId });
    if (post && !result.published.includes(post.id)) {
      // A relay message for a post beyond QStash's delay cap: enqueue the next hop.
      const current = await prisma.post.findUnique({ where: { id: post.id }, select: { status: true, scheduleMessageId: true } });
      if (current?.status === "scheduled") await syncPostSchedule(post.id, null);
    }
    const rearm = post ? { rearmed: 0 } : await rearmScheduledPosts();
    return NextResponse.json({ handled: true, ...result, ...rearm });
  } catch (error) {
    console.error("[Scheduling] callback-failed", { error: error instanceof Error ? error.message : String(error) });
    // A 5xx makes QStash retry the delivery.
    return NextResponse.json({ error: "Publishing scheduled posts failed" }, { status: 500 });
  }
}
