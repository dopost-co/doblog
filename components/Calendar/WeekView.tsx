"use client";

import { useEffect, useRef } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import { AddSlotMenu } from "./AddSlotMenu";
import { CalendarDropZone } from "./CalendarDragProvider";
import { DraggableCalendarEntry } from "./CalendarEntryCard";
import { WEEK_STARTS_ON, toDateKey } from "./calendar-utils";
import type { CalendarViewProps } from "./types";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const GRID = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";

export function WeekView({ currentDate, entriesByDate, pendingIds, onOpen, onAdd, onScheduleDraft, hasDrafts }: CalendarViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const todayKey = toDateKey(new Date());
  const now = new Date();

  // Scroll only the grid to 8:00 so the page itself does not move.
  useEffect(() => {
    const container = scrollRef.current;
    const hour = container?.querySelector<HTMLElement>('[data-hour="8"]');
    if (container && hour) container.scrollTop = hour.offsetTop;
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className={cn(GRID, "shrink-0 border-b bg-muted/40")}>
        <div />
        {days.map((day) => {
          const isToday = toDateKey(day) === todayKey;
          return (
            <div key={day.toISOString()} className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs">
              <span className="font-medium text-muted-foreground">{format(day, "EEE")}</span>
              <span className={cn("flex size-6 items-center justify-center rounded-full", isToday && "bg-primary font-semibold text-primary-foreground")}>
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} data-calendar-scroll-container className="relative min-h-0 flex-1 overflow-y-auto">
        {HOURS.map((hour) => (
          <div key={hour} data-hour={hour} className={cn(GRID, "min-h-14 border-b last:border-b-0")}>
            <div className="border-r px-2 pt-1 text-right text-[11px] tabular-nums text-muted-foreground">
              {`${hour.toString().padStart(2, "0")}:00`}
            </div>
            {days.map((day) => {
              const dateKey = toDateKey(day);
              const slot = new Date(day);
              slot.setHours(hour, 0, 0, 0);
              const slotEnd = new Date(slot);
              slotEnd.setHours(hour + 1);
              const isPast = slotEnd <= now;
              const entries = (entriesByDate[dateKey] ?? []).filter((entry) => entry.at.getHours() === hour);
              return (
                <CalendarDropZone
                  key={dateKey}
                  target={{ date: dateKey, hour }}
                  disabled={isPast}
                  className={cn("group relative flex flex-col gap-1 border-r p-1 last:border-r-0", isPast && "calendar-past-day")}
                >
                  {!isPast && (
                    <AddSlotMenu
                      hasDrafts={hasDrafts}
                      onNewPost={() => onAdd(slot)}
                      onScheduleDraft={() => onScheduleDraft(slot)}
                      className="absolute right-1 top-1 z-10 opacity-0 group-hover:opacity-100"
                    />
                  )}
                  {entries.map((entry) => (
                    <DraggableCalendarEntry key={entry.entryId} entry={entry} pending={pendingIds.has(entry.entryId)} onOpen={onOpen} compact />
                  ))}
                </CalendarDropZone>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
