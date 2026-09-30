"use client";

import { WEEKDAYS } from "@/lib/autopilot/writing-days";
import { cn } from "@/lib/utils";

/** The weekdays Autopilot writes on, as a row of toggles (Monday first). */
export function WritingDaysPicker({ value, onChange, disabled }: {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="group" aria-label="Writing days">
        {WEEKDAYS.map((day) => {
          const selected = value.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              title={day.name}
              aria-label={day.name}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? value.filter((item) => item !== day.value) : [...value, day.value])}
              className={cn(
                "flex size-10 items-center justify-center rounded-full border text-sm transition-colors disabled:opacity-50",
                selected ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {day.short}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length
          ? `${value.length} ${value.length === 1 ? "article" : "articles"} a week, written in the morning (UTC).`
          : "Choose at least one day."}
      </p>
    </div>
  );
}
