"use client";

import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { AddSlotMenu } from "./AddSlotMenu";
import { CalendarDropZone } from "./CalendarDragProvider";
import { DraggableCalendarEntry } from "./CalendarEntryCard";
import { WEEK_STARTS_ON, toDateKey, type CalendarEntry } from "./calendar-utils";
import type { CalendarViewProps } from "./types";

const MAX_VISIBLE = 3;

export function MonthView({ currentDate, entriesByDate, pendingIds, onOpen, onAdd, onScheduleDraft, onShowDay, hasDrafts }: CalendarViewProps) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON });
  const days = eachDayOfInterval({ start, end });
  const todayKey = toDateKey(new Date());

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/40">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
            {format(addDays(start, index), "EEE")}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}
      >
        {days.map((day, index) => {
          const dateKey = toDateKey(day);
          const entries: CalendarEntry[] = entriesByDate[dateKey] ?? [];
          const isPast = dateKey < todayKey;
          const isToday = dateKey === todayKey;
          const outside = !isSameMonth(day, currentDate);
          const hidden = entries.length - MAX_VISIBLE;

          return (
            <CalendarDropZone
              key={dateKey}
              target={{ date: dateKey }}
              disabled={isPast}
              className={cn(
                "group relative flex min-h-0 flex-col gap-1 overflow-hidden border-b border-r p-1.5 transition-colors",
                index % 7 === 6 && "border-r-0",
                index >= days.length - 7 && "border-b-0",
                isPast && "calendar-past-day",
              )}
            >
              <div className="flex h-6 shrink-0 items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs",
                    isToday ? "bg-primary font-semibold text-primary-foreground" : isPast ? "text-muted-foreground" : outside ? "text-foreground/60" : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                {!isPast && (
                  <AddSlotMenu
                    hasDrafts={hasDrafts}
                    onNewPost={() => onAdd(day)}
                    onScheduleDraft={() => onScheduleDraft(day)}
                    className="opacity-0 group-hover:opacity-100"
                  />
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-1">
                {entries.slice(0, MAX_VISIBLE).map((entry) => (
                  <DraggableCalendarEntry key={entry.entryId} entry={entry} pending={pendingIds.has(entry.entryId)} onOpen={onOpen} compact />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="rounded px-1 text-left text-xs text-muted-foreground hover:text-foreground"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </CalendarDropZone>
          );
        })}
      </div>
    </div>
  );
}
