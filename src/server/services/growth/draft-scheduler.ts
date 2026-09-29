import { prisma } from "@/lib/prisma";
import { generateContentPlanDraft } from "./service";

export async function runDueDraftGenerations(limit = 2) {
  const due = await prisma.contentPlanItem.findMany({
    where: {
      status: "planned", postId: null, scheduledFor: { lte: new Date() },
      blog: { seoSettings: { draftAutomationEnabled: true } },
    },
    orderBy: { scheduledFor: "asc" }, take: Math.max(1, Math.min(limit, 3)),
    select: { id: true, blogId: true },
  });
  const settled = await Promise.allSettled(due.map(item => generateContentPlanDraft(item.blogId, item.id, "scheduler")));
  return {
    attempted: due.length,
    completed: settled.filter(result => result.status === "fulfilled").length,
    failed: settled.filter(result => result.status === "rejected").length,
  };
}
