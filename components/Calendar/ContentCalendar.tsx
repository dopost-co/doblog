"use client";

import { toast } from "sonner";
import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addMonths, addWeeks, endOfWeek, format, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { updatePost } from "@/src/server/services/posts/mutations";
import { CalendarDragProvider } from "./CalendarDragProvider";
import { CalendarEntryCard, DraggableCalendarEntry } from "./CalendarEntryCard";
import { ListView } from "./ListView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import {
  WEEK_STARTS_ON,
  buildCalendarEntries,
  buildRescheduleDate,
  groupEntriesByDate,
  toDateKey,
  type CalendarDraft,
  type CalendarDropTarget,
  type CalendarEntry,
  type CalendarPost,
  type CalendarView,
} from "./calendar-utils";

/** Day-level slots default to 09:00; if that already passed, to the next full hour. */
function defaultSlotTime(at: Date) {
  const slot = new Date(at);
  if (slot.getHours() === 0 && slot.getMinutes() === 0) slot.setHours(9);
  const now = new Date();
  if (slot <= now) {
    slot.setTime(now.getTime());
    slot.setHours(now.getHours() + 1, 0, 0, 0);
  }
  return slot;
}

const slotLabel = (date: Date) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);

export function ContentCalendar({
  blogId,
  view,
  date,
  posts,
  drafts,
}: {
  blogId: string;
  view: CalendarView;
  date: string;
  posts: CalendarPost[];
  drafts: CalendarDraft[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  const currentDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const [overrides, setOverrides] = useState<Record<string, { from: string; to: string }>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [draftSlot, setDraftSlot] = useState<Date | null>(null);
  const [dayDialog, setDayDialog] = useState<Date | null>(null);

  // An optimistic move applies only while the server still reports the old date,
  // so it expires on its own once fresh data arrives.
  const visiblePosts = useMemo(
    () => posts.map((post) => (overrides[post.id]?.from === post.publishedAt ? { ...post, publishedAt: overrides[post.id].to } : post)),
    [posts, overrides],
  );
  const entriesByDate = useMemo(() => groupEntriesByDate(buildCalendarEntries(visiblePosts)), [visiblePosts]);

  const navigate = useCallback((nextView: CalendarView, nextDate: Date) => {
    const query = new URLSearchParams({ view: nextView, date: toDateKey(nextDate) });
    startNavigation(() => router.push(`${pathname}?${query.toString()}`));
  }, [pathname, router]);

  const step = (direction: 1 | -1) => {
    if (view === "week") navigate(view, direction === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else navigate(view, direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const headerLabel = view === "week"
    ? `${format(startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON }), "d MMM")} – ${format(endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON }), "d MMM yyyy")}`
    : format(currentDate, "MMMM yyyy");

  const openEntry = (entry: CalendarEntry) => router.push(`/dashboard/blogs/${blogId}/posts/${entry.post.id}/edit`);
  const addPost = (at: Date) => {
    const query = new URLSearchParams({ scheduleAt: defaultSlotTime(at).toISOString() });
    router.push(`/dashboard/blogs/${blogId}/posts/new?${query.toString()}`);
  };

  async function reschedule(entry: CalendarEntry, at: Date) {
    if (at <= new Date()) {
      toast.error("Pick a time in the future to schedule a post.");
      return;
    }
    const iso = at.toISOString();
    setPendingIds((ids) => new Set(ids).add(entry.entryId));
    const from = entry.post.publishedAt;
    setOverrides((current) => ({ ...current, ...Object.fromEntries(entry.postIds.map((id) => [id, { from, to: iso }])) }));
    // Translations scheduled together move together.
    const results = await Promise.all(entry.postIds.map((id) => updatePost(id, { status: "scheduled", publishedAt: at })));
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      toast.error(failed.error);
      setOverrides((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !entry.postIds.includes(id))));
    }
    else toast.success(`Moved to ${slotLabel(at)}`);
    setPendingIds((ids) => {
      const next = new Set(ids);
      next.delete(entry.entryId);
      return next;
    });
    router.refresh();
  }

  async function scheduleDraft(draft: CalendarDraft) {
    if (!draftSlot) return;
    const at = defaultSlotTime(draftSlot);
    setDraftSlot(null);
    const result = await updatePost(draft.id, { status: "scheduled", publishedAt: at });
    if (result.error) toast.error(result.error);
    else toast.success(`Scheduled for ${slotLabel(at)}`);
    router.refresh();
  }

  const viewProps = {
    currentDate,
    entriesByDate,
    pendingIds,
    hasDrafts: drafts.length > 0,
    onOpen: openEntry,
    onAdd: addPost,
    onScheduleDraft: (at: Date) => setDraftSlot(at),
    onShowDay: (day: Date) => setDayDialog(day),
  };

  return (
    <div className="flex min-h-[560px] flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Button variant="outline" size="icon-sm" className="rounded-r-none" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <div className="flex h-8 min-w-36 items-center justify-center border-y bg-card px-3 text-sm font-medium dark:border-input dark:bg-input/30">
              {isNavigating ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : headerLabel}
            </div>
            <Button variant="outline" size="icon-sm" className="rounded-l-none" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(view, new Date())}>Today</Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" />Scheduled</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" />Published</span>
          </div>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 transition-opacity", isNavigating && "opacity-60")}>
        <CalendarDragProvider
          onDrop={({ entry, target }: { entry: CalendarEntry; target: CalendarDropTarget }) => reschedule(entry, buildRescheduleDate(entry.at, target))}
          renderOverlay={(entry) => <CalendarEntryCard entry={entry} compact />}
        >
          {view === "month" && <MonthView {...viewProps} />}
          {view === "week" && <WeekView {...viewProps} />}
          {view === "list" && <ListView {...viewProps} />}
        </CalendarDragProvider>
      </div>

      <Dialog open={Boolean(draftSlot)} onOpenChange={(open) => !open && setDraftSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a draft</DialogTitle>
            <DialogDescription>
              {draftSlot && `It will be published on ${format(defaultSlotTime(draftSlot), "PPPp")}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-2 max-h-80 overflow-y-auto">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => scheduleDraft(draft)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{draft.title}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{draft.language}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dayDialog)} onOpenChange={(open) => !open && setDayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dayDialog && format(dayDialog, "EEEE, d MMMM")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {dayDialog && (entriesByDate[toDateKey(dayDialog)] ?? []).map((entry) => (
              <DraggableCalendarEntry key={entry.entryId} entry={{ ...entry, draggable: false }} onOpen={openEntry} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
