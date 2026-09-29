"use client";

import { eachDayOfInterval, endOfMonth, format, startOfMonth, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { AddSlotMenu } from "./AddSlotMenu";
import { CalendarDropZone } from "./CalendarDragProvider";
import { DraggableCalendarEntry } from "./CalendarEntryCard";
import { toDateKey } from "./calendar-utils";
import type { CalendarViewProps } from "./types";

/** Agenda of the current and next month; empty past days are skipped to keep it short. */
export function ListView({ currentDate, entriesByDate, pendingIds, onOpen, onAdd, onScheduleDraft, hasDrafts }: CalendarViewProps) {
  const todayKey = toDateKey(new Date());
  const days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(addMonths(currentDate, 1)) })
    .filter((day) => toDateKey(day) >= todayKey || (entriesByDate[toDateKey(day)]?.length ?? 0) > 0);

  return (
    <div data-calendar-scroll-container className="h-full min-h-0 overflow-y-auto rounded-lg border">
      {days.map((day) => {
        const dateKey = toDateKey(day);
        const entries = entriesByDate[dateKey] ?? [];
        const isPast = dateKey < todayKey;
        const isToday = dateKey === todayKey;
        const isMonthStart = day.getDate() === 1 || day === days[0];
        return (
          <div key={dateKey}>
            {isMonthStart && (
              <div className="sticky top-0 z-10 border-b bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                {format(day, "MMMM yyyy")}
              </div>
            )}
            <CalendarDropZone
              target={{ date: dateKey }}
              disabled={isPast}
              className={cn("group flex gap-4 border-b px-4 py-3 last:border-b-0", isPast && "calendar-past-day")}
            >
              <div className="w-16 shrink-0">
                <p className={cn("text-xs text-muted-foreground", isToday && "font-medium text-foreground")}>{isToday ? "Today" : format(day, "EEE")}</p>
                <p className={cn("text-lg font-semibold leading-tight", isPast && "text-muted-foreground")}>{format(day, "d")}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {entries.length === 0 && <p className="py-1 text-xs text-muted-foreground/70">No posts</p>}
                {entries.map((entry) => (
                  <DraggableCalendarEntry key={entry.entryId} entry={entry} pending={pendingIds.has(entry.entryId)} onOpen={onOpen} />
                ))}
              </div>
              {!isPast && (
                <AddSlotMenu
                  hasDrafts={hasDrafts}
                  onNewPost={() => onAdd(day)}
                  onScheduleDraft={() => onScheduleDraft(day)}
                  className="mt-1 opacity-0 group-hover:opacity-100"
                />
              )}
            </CalendarDropZone>
          </div>
        );
      })}
    </div>
  );
}
