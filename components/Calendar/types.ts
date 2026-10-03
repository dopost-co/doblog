import type { CalendarEntry } from "./calendar-utils";

export interface CalendarViewProps {
  currentDate: Date;
  entriesByDate: Record<string, CalendarEntry[]>;
  pendingIds: ReadonlySet<string>;
  hasDrafts: boolean;
  /** Viewers see the calendar without adding or moving posts. */
  readOnly: boolean;
  onOpen: (entry: CalendarEntry) => void;
  onAdd: (at: Date) => void;
  onScheduleDraft: (at: Date) => void;
  onShowDay: (day: Date) => void;
}
