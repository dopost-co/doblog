/**
 * Autopilot writes on chosen weekdays. Days are UTC weekdays as stored:
 * 0 = Sunday … 6 = Saturday (Date#getUTCDay).
 */
export const WEEKDAYS = [
  { value: 1, short: "M", name: "Monday" },
  { value: 2, short: "T", name: "Tuesday" },
  { value: 3, short: "W", name: "Wednesday" },
  { value: 4, short: "T", name: "Thursday" },
  { value: 5, short: "F", name: "Friday" },
  { value: 6, short: "S", name: "Saturday" },
  { value: 0, short: "S", name: "Sunday" },
] as const;

export const DEFAULT_WRITING_DAYS = [1, 3, 5];

/** Evenly spread days for a weekly count, for callers that only send how many per week. */
const DAYS_FOR_PACE: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function daysForPace(perWeek: number) {
  return DAYS_FOR_PACE[perWeek] ?? DEFAULT_WRITING_DAYS;
}

/** Valid, unique weekdays in order. */
export function normalizeWritingDays(days: readonly (number | string)[]) {
  return [...new Set(days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}
