import { describe, expect, it } from "vitest";
import { weekdayScheduleDates } from "@/src/server/services/growth/planning";
import { discoverySettingsSchema } from "@/src/server/services/growth/discovery";

describe("Custom writing days", () => {
  // Wednesday 30 September 2026, 15:00 UTC.
  const from = new Date("2026-09-30T15:00:00Z");

  it("schedules on the chosen weekdays at 09:00 UTC, starting after today", () => {
    const dates = weekdayScheduleDates([1, 3, 4], 4, from).map((date) => date.toISOString());
    expect(dates).toEqual([
      "2026-10-01T09:00:00.000Z", // Thursday
      "2026-10-05T09:00:00.000Z", // Monday
      "2026-10-07T09:00:00.000Z", // Wednesday
      "2026-10-08T09:00:00.000Z", // Thursday
    ]);
  });

  it("returns nothing without valid days", () => {
    expect(weekdayScheduleDates([], 3, from)).toEqual([]);
    expect(weekdayScheduleDates([9], 3, from)).toEqual([]);
  });

  it("requires the weekly pace to match the chosen days", () => {
    const base = { website: "https://example.com", frequency: "weekly" as const, topicsPerRun: 12, publishingMode: "review" as const };
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 3, writingDays: [1, 3, 4] }).success).toBe(true);
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 4, writingDays: [1, 2, 3, 4] }).success).toBe(true);
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 2, writingDays: [1, 3, 4] }).success).toBe(false);
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 3, writingDays: [1, 1, 4] }).success).toBe(false);
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 4 }).success).toBe(false);
  });
});

describe("Idea queue top-up", async () => {
  const { ideasNeeded } = await import("@/src/server/services/growth/discovery");

  it("fills the queue up to two weeks of writing", () => {
    expect(ideasNeeded(3, 0, 12)).toBe(6);
    expect(ideasNeeded(3, 4, 12)).toBe(2);
  });

  it("adds nothing when the queue already covers two weeks", () => {
    expect(ideasNeeded(3, 6, 12)).toBe(0);
    expect(ideasNeeded(2, 9, 8)).toBe(0);
  });

  it("never adds more than one run allows", () => {
    expect(ideasNeeded(7, 0, 8)).toBe(8);
  });
});
