"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "./calendar-utils";
import { useCalendarDrag } from "./CalendarDragProvider";

const STATUS_DOT = {
  scheduled: "bg-sky-500",
  published: "bg-emerald-500",
} as const;

export function CalendarEntryCard({
  entry,
  compact = false,
  className,
}: {
  entry: CalendarEntry;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-left text-xs shadow-xs",
        entry.post.status === "published" && "text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[entry.post.status])} />
      <span className="shrink-0 tabular-nums text-muted-foreground">{format(entry.at, "HH:mm")}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{entry.post.title}</span>
      {!compact && entry.languages.length > 1 && (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
          {entry.languages.length}
        </span>
      )}
    </div>
  );
}

export function DraggableCalendarEntry({
  entry,
  pending,
  onOpen,
  compact,
}: {
  entry: CalendarEntry;
  pending?: boolean;
  onOpen: (entry: CalendarEntry) => void;
  compact?: boolean;
}) {
  const { beginDrag } = useCalendarDrag();
  const draggedRef = useRef(false);
  const disabled = !entry.draggable || pending;

  return (
    <button
      type="button"
      title={`${entry.post.title} · ${entry.post.status === "scheduled" ? "Scheduled" : "Published"} ${format(entry.at, "PPp")}`}
      className={cn(
        "relative block w-full rounded-md text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
        !disabled && "cursor-grab touch-none active:cursor-grabbing",
        pending && "opacity-60",
      )}
      onPointerDown={(event) => {
        if (disabled) return;
        beginDrag(event, entry, {
          onActivated: () => { draggedRef.current = true; },
          onFinished: () => { draggedRef.current = false; },
        });
      }}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onOpen(entry);
      }}
    >
      <CalendarEntryCard entry={entry} compact={compact} className="hover:bg-accent/60" />
      {pending && <Loader2 className="absolute right-1.5 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />}
    </button>
  );
}
