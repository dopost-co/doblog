import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addMonths,
} from "date-fns";

export type CalendarView = "month" | "week" | "list";
/** "idea": an Autopilot idea waiting to be written on that date (not a post yet). */
export type CalendarPostStatus = "scheduled" | "published" | "idea";

export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "list"];
export const WEEK_STARTS_ON = 1;

export interface CalendarPost {
  id: string;
  title: string;
  status: CalendarPostStatus;
  publishedAt: string;
  language: string;
  coverImage: string | null;
  translationGroupId: string | null;
  /** Ideas only: the languages it will be translated into once written. */
  alsoIn?: string[];
  /** Ideas only: published right after writing instead of left as a draft. */
  autoPublish?: boolean;
}

export interface CalendarDraft {
  id: string;
  title: string;
  language: string;
  updatedAt: string;
}

/** One card on the calendar: a post plus its translations scheduled for the same instant. */
export interface CalendarEntry {
  entryId: string;
  post: CalendarPost;
  postIds: string[];
  languages: string[];
  at: Date;
  draggable: boolean;
}

export interface CalendarDropTarget {
  date: string;
  hour?: number;
}

export function parseCalendarView(value: string | undefined): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView) ? (value as CalendarView) : "month";
}

export function parseCalendarDate(value: string | undefined): Date {
  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : new Date();
  return isValid(parsed) ? startOfDay(parsed) : startOfDay(new Date());
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/**
 * The instants a view shows. Padded by a day on each side because the server
 * computes the range in its own timezone while the browser renders in local time.
 */
export function getCalendarRange(view: CalendarView, date: Date) {
  let start: Date;
  let end: Date;
  if (view === "week") {
    start = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    end = addDays(start, 7);
  } else if (view === "list") {
    start = startOfMonth(date);
    end = addDays(endOfMonth(addMonths(date, 1)), 1);
  } else {
    start = startOfWeek(startOfMonth(date), { weekStartsOn: WEEK_STARTS_ON });
    end = addDays(endOfWeek(endOfMonth(date), { weekStartsOn: WEEK_STARTS_ON }), 1);
  }
  return { start: addDays(start, -1), end: addDays(end, 1) };
}

export function buildCalendarEntries(posts: CalendarPost[]): CalendarEntry[] {
  const groups = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const key = post.translationGroupId
      ? `${post.translationGroupId}:${post.status}:${post.publishedAt}`
      : post.id;
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return [...groups.entries()]
    .map(([entryId, group]) => {
      const post = group.find((item) => item.language === "en") ?? group[0];
      return {
        entryId,
        post,
        postIds: group.map((item) => item.id),
        languages: [...group.map((item) => item.language), ...(post.alsoIn ?? [])],
        at: new Date(post.publishedAt),
        draggable: post.status === "scheduled",
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function groupEntriesByDate(entries: CalendarEntry[]) {
  return entries.reduce<Record<string, CalendarEntry[]>>((acc, entry) => {
    (acc[toDateKey(entry.at)] ??= []).push(entry);
    return acc;
  }, {});
}

/** Month and list drops keep the time of day; week drops land on the hour. */
export function buildRescheduleDate(current: Date, target: CalendarDropTarget) {
  const day = parse(target.date, "yyyy-MM-dd", new Date());
  const next = new Date(day);
  if (target.hour !== undefined) next.setHours(target.hour, 0, 0, 0);
  else next.setHours(current.getHours(), current.getMinutes(), 0, 0);
  return next;
}
