import { describe, expect, it } from "vitest";
import { weekdayScheduleDates } from "@/src/server/services/growth/planning";
import { discoverySettingsSchema } from "@/src/server/services/growth/discovery";

describe("Custom writing days", () => {
  // Wednesday 30 September 2026, 15:00 UTC.
  const from = new Date("2026-09-30T15:00:00Z");

  it("schedules on the chosen weekdays at 09:00 UTC by default, starting after today", () => {
    const dates = weekdayScheduleDates([1, 3, 4], 4, from).map((date) => date.toISOString());
    expect(dates).toEqual([
      "2026-10-01T09:00:00.000Z", // Thursday
      "2026-10-05T09:00:00.000Z", // Monday
      "2026-10-07T09:00:00.000Z", // Wednesday
      "2026-10-08T09:00:00.000Z", // Thursday
    ]);
  });

  it("writes at 09:00 in the blog's timezone, across daylight-saving changes", () => {
    // Madrid leaves summer time on Sunday 25 October 2026.
    const dates = weekdayScheduleDates([1, 6], 3, new Date("2026-10-23T12:00:00Z"), "Europe/Madrid").map((date) => date.toISOString());
    expect(dates).toEqual([
      "2026-10-24T07:00:00.000Z", // Saturday, 09:00 CEST
      "2026-10-26T08:00:00.000Z", // Monday, 09:00 CET
      "2026-10-31T08:00:00.000Z", // Saturday
    ]);
  });

  it("uses the local date, not the UTC one, to start after today", () => {
    // 23:30 UTC on Wednesday is already Thursday in Tokyo, so the next writing day is Friday.
    const dates = weekdayScheduleDates([4, 5], 1, new Date("2026-09-30T23:30:00Z"), "Asia/Tokyo").map((date) => date.toISOString());
    expect(dates).toEqual(["2026-10-02T00:00:00.000Z"]);
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(weekdayScheduleDates([4], 1, from, "Not/AZone")[0].toISOString()).toBe("2026-10-01T09:00:00.000Z");
  });

  it("returns nothing without valid days", () => {
    expect(weekdayScheduleDates([], 3, from)).toEqual([]);
    expect(weekdayScheduleDates([9], 3, from)).toEqual([]);
  });

  it("accepts days, or a weekly count from older clients", () => {
    const base = { website: "https://example.com", frequency: "weekly" as const, topicsPerRun: 12, publishingMode: "review" as const };
    expect(discoverySettingsSchema.safeParse({ ...base, writingDays: [1, 3, 4] }).success).toBe(true);
    expect(discoverySettingsSchema.safeParse({ ...base, draftsPerWeek: 4 }).success).toBe(true);
    expect(discoverySettingsSchema.safeParse({ ...base, writingDays: [1, 1, 4] }).success).toBe(false);
    expect(discoverySettingsSchema.safeParse({ ...base, writingDays: [] }).success).toBe(false);
    expect(discoverySettingsSchema.safeParse(base).success).toBe(false);
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
