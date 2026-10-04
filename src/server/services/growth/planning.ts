import { prisma } from "@/lib/prisma";
import { daysForPace } from "@/lib/autopilot/writing-days";

/** Autopilot writes at this local hour of the blog's timezone. */
const WRITING_HOUR = 9;

/** The calendar date (year, month, day) of an instant in a timezone. */
function localDate(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(instant).map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month - 1, day: parts.day };
}

/** How far the timezone is ahead of UTC at an instant, in milliseconds. */
function zoneOffset(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(instant).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a wall-clock time happens in a timezone (daylight saving included). */
export function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string) {
  const wall = Date.UTC(year, month, day, hour);
  const first = wall - zoneOffset(new Date(wall), timeZone);
  return new Date(wall - zoneOffset(new Date(first), timeZone));
}

function validTimeZone(timeZone: string | null | undefined) {
  try { return timeZone ? (new Intl.DateTimeFormat("en", { timeZone }), timeZone) : "UTC"; }
  catch { return "UTC"; }
}

/**
 * Writing dates on the chosen weekdays (0 = Sunday … 6 = Saturday) of the
 * blog's timezone at 09:00 local time, from the day after `from`, one per day.
 */
export function weekdayScheduleDates(days: readonly number[], count: number, from = new Date(), timeZone = "UTC") {
  const wanted = new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  const dates: Date[] = [];
  if (!wanted.size) return dates;
  const zone = validTimeZone(timeZone);
  const start = localDate(from, zone);
  // Calendar days counted in UTC so daylight-saving changes never skip or repeat one.
  for (let offset = 1; dates.length < count; offset += 1) {
    const day = new Date(Date.UTC(start.year, start.month, start.day + offset));
    if (wanted.has(day.getUTCDay())) dates.push(zonedTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), WRITING_HOUR, zone));
  }
  return dates;
}

export async function schedulePendingDrafts(blogId: string, reset = false) {
  const settings = await prisma.blogSeoSettings.findUnique({
    where: { blogId }, select: { draftAutomationEnabled: true, draftsPerWeek: true, writingDays: true, timezone: true },
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
  const dates = weekdayScheduleDates(days, items.length, last?.scheduledFor || new Date(), settings.timezone);
  await prisma.$transaction(items.map((item, index) => prisma.contentPlanItem.update({ where: { id: item.id }, data: { scheduledFor: dates[index] } })));
  return { scheduled: items.length };
}
