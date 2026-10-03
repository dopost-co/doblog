import { describe, expect, it } from "vitest";
import { buildCalendarEntries } from "@/components/Calendar/calendar-utils";

describe("Autopilot ideas on the calendar", () => {
  it("shows an idea with the languages it will be translated into, and never as draggable", () => {
    const [entry] = buildCalendarEntries([{
      id: "idea-1", title: "Mejores horarios", status: "idea", publishedAt: "2026-10-05T09:00:00.000Z",
      language: "es", coverImage: null, translationGroupId: null, alsoIn: ["en"], autoPublish: true,
    }]);
    expect(entry).toMatchObject({ entryId: "idea-1", languages: ["es", "en"], draggable: false });
  });

  it("keeps scheduled posts draggable next to ideas", () => {
    const entries = buildCalendarEntries([
      { id: "p", title: "Post", status: "scheduled", publishedAt: "2026-10-05T10:00:00.000Z", language: "es", coverImage: null, translationGroupId: null },
      { id: "i", title: "Idea", status: "idea", publishedAt: "2026-10-05T09:00:00.000Z", language: "es", coverImage: null, translationGroupId: null },
    ]);
    expect(entries.map((entry) => [entry.entryId, entry.draggable])).toEqual([["i", false], ["p", true]]);
  });
});
