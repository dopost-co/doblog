import { prisma } from "@/lib/prisma";
import { daysForPace } from "@/lib/autopilot/writing-days";

const DAY_MS = 86_400_000;

function nextMorning(from: Date) {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

/**
 * Writing dates on the chosen UTC weekdays (0 = Sunday … 6 = Saturday) at
 * 09:00, the first one after `from`, one per day.
 */
export function weekdayScheduleDates(days: readonly number[], count: number, from = new Date()) {
  const wanted = new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  const dates: Date[] = [];
  if (!wanted.size) return dates;
  let cursor = nextMorning(from);
  while (dates.length < count) {
    if (wanted.has(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return dates;
}

export async function schedulePendingDrafts(blogId: string, reset = false) {
  const settings = await prisma.blogSeoSettings.findUnique({
    where: { blogId }, select: { draftAutomationEnabled: true, draftsPerWeek: true, writingDays: true },
  });
  if (!settings?.draftAutomationEnabled) {
    if (reset) await prisma.contentPlanItem.updateMany({ where: { blogId, status: "planned", postId: null }, data: { scheduledFor: null } });
    return { scheduled: 0 };
  }

  if (reset) await prisma.contentPlanItem.updateMany({ where: { blogId, status: "planned", postId: null }, data: { scheduledFor: null } });
  const [items, last] = await Promise.all([
    prisma.contentPlanItem.findMany({
      where: { blogId, status: "planned", postId: null, scheduledFor: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, select: { id: true },
    }),
    reset ? null : prisma.contentPlanItem.findFirst({
      where: { blogId, status: "planned", postId: null, scheduledFor: { gt: new Date() } },
      orderBy: { scheduledFor: "desc" }, select: { scheduledFor: true },
    }),
  ]);
  if (!items.length) return { scheduled: 0 };
  const days = settings.writingDays.length ? settings.writingDays : daysForPace(settings.draftsPerWeek);
  const dates = weekdayScheduleDates(days, items.length, last?.scheduledFor || new Date());
  await prisma.$transaction(items.map((item, index) => prisma.contentPlanItem.update({ where: { id: item.id }, data: { scheduledFor: dates[index] } })));
  return { scheduled: items.length };
}
