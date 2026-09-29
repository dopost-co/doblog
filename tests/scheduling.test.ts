import { beforeEach, describe, expect, it, vi } from "vitest";
import { postCreateSchema, postListSchema, postUpdateSchema } from "@/lib/integrations/schemas";
import { buildCalendarEntries, buildRescheduleDate, getCalendarRange } from "@/components/Calendar/calendar-utils";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  publishJSON: vi.fn(),
  deleteMessage: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { post: { findMany: mocks.findMany, findUnique: mocks.findUnique, updateMany: mocks.updateMany, update: mocks.update } },
}));
vi.mock("@/src/server/services/content/cache", () => ({ invalidateContent: mocks.invalidate }));
vi.mock("@upstash/qstash", () => ({
  Client: class { publishJSON = mocks.publishJSON; messages = { delete: mocks.deleteMessage }; },
  Receiver: class {},
}));
import { publishDueScheduledPosts, syncPostSchedule } from "@/src/server/services/scheduling/service";
import { getQStashDestinationBaseUrl } from "@/lib/qstash";

describe("scheduled publishing", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("publishes only posts still scheduled for the due instant and invalidates each blog once", async () => {
    const at = new Date("2026-10-01T09:00:00Z");
    mocks.findMany.mockResolvedValue([
      { id: "a", blogId: "b1", publishedAt: at, blog: { blogId: "pub-1" } },
      { id: "b", blogId: "b1", publishedAt: at, blog: { blogId: "pub-1" } },
      { id: "c", blogId: "b2", publishedAt: at, blog: { blogId: "pub-2" } },
    ]);
    // "c" was rescheduled between the read and the write.
    mocks.updateMany.mockImplementation(async ({ where }) => ({ count: where.id === "c" ? 0 : 1 }));

    const result = await publishDueScheduledPosts({ now: new Date("2026-10-01T09:00:01Z") });

    expect(result.published).toEqual(["a", "b"]);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "a", status: "scheduled", publishedAt: at },
      data: { status: "published", scheduleMessageId: null },
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith({ blogId: "b1", publicBlogId: "pub-1" });
  });

  it("enqueues a delayed QStash message and cancels the previous one on reschedule", async () => {
    vi.stubEnv("QSTASH_TOKEN", "token");
    vi.stubEnv("QSTASH_API_URL", "https://cms.example/");
    const at = new Date("2026-10-01T09:00:00Z");
    mocks.findUnique.mockResolvedValue({ id: "p", status: "scheduled", publishedAt: at, scheduleMessageId: "old" });
    mocks.publishJSON.mockResolvedValue({ messageId: "new" });

    await syncPostSchedule("p", "older");

    expect(mocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://cms.example/api/qstash/publish-scheduled",
      body: { postId: "p" },
      notBefore: at.getTime() / 1000,
    }));
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "p", status: "scheduled", publishedAt: at },
      data: { scheduleMessageId: "new" },
    });
    expect(mocks.deleteMessage.mock.calls.map(([id]) => id).sort()).toEqual(["old", "older"]);
  });

  it("relays posts beyond the QStash delay cap instead of failing", async () => {
    vi.stubEnv("QSTASH_TOKEN", "token");
    vi.stubEnv("QSTASH_API_URL", "https://cms.example");
    const now = Date.now();
    const far = new Date(now + 14 * 24 * 60 * 60 * 1000);
    mocks.findUnique.mockResolvedValue({ id: "p", status: "scheduled", publishedAt: far, scheduleMessageId: null });
    mocks.publishJSON.mockResolvedValue({ messageId: "relay" });
    await syncPostSchedule("p", null);
    const notBefore = mocks.publishJSON.mock.calls[0][0].notBefore * 1000;
    expect(notBefore).toBeLessThan(now + 7 * 24 * 60 * 60 * 1000);
    expect(notBefore).toBeGreaterThan(now + 6 * 24 * 60 * 60 * 1000);
  });

  it("only cancels when a post is unscheduled", async () => {
    vi.stubEnv("QSTASH_TOKEN", "token");
    mocks.findUnique.mockResolvedValue({ id: "p", status: "draft", publishedAt: null, scheduleMessageId: null });
    await syncPostSchedule("p", "old");
    expect(mocks.publishJSON).not.toHaveBeenCalled();
    expect(mocks.deleteMessage).toHaveBeenCalledWith("old");
  });

  it("requires an HTTPS callback origin", () => {
    expect(() => getQStashDestinationBaseUrl({ NEXTAUTH_URL: "http://localhost:4444" })).toThrow("HTTPS");
    expect(getQStashDestinationBaseUrl({ QSTASH_API_URL: "https://cms.example/?x=1" })).toBe("https://cms.example");
  });
});

describe("scheduling input", () => {
  it("accepts scheduled status and calendar range filters", () => {
    expect(postCreateSchema.parse({
      title: "T", slug: "t", content: { blocks: [] }, status: "scheduled", publishedAt: "2026-10-01T09:00:00+02:00",
    }).status).toBe("scheduled");
    expect(postUpdateSchema.parse({ status: "scheduled" }).status).toBe("scheduled");
    expect(postListSchema.parse({ status: "scheduled", publishedFrom: "2026-10-01T00:00:00Z" }).publishedFrom).toBeDefined();
  });
});

describe("calendar helpers", () => {
  const post = (id: string, language: string, publishedAt = "2026-10-01T09:30:00.000Z") => ({
    id, title: id, status: "scheduled" as const, publishedAt, language, coverImage: null, translationGroupId: "g",
  });

  it("groups translations scheduled together into one draggable entry", () => {
    const entries = buildCalendarEntries([post("es", "es"), post("en", "en"), post("later", "fr", "2026-10-02T09:30:00.000Z")]);
    expect(entries).toHaveLength(2);
    expect(entries[0].post.id).toBe("en");
    expect(entries[0].postIds.sort()).toEqual(["en", "es"]);
    expect(entries[0].draggable).toBe(true);
  });

  it("keeps the time on day drops and snaps to the hour on week drops", () => {
    const current = new Date(2026, 9, 1, 9, 30);
    expect(buildRescheduleDate(current, { date: "2026-10-05" })).toEqual(new Date(2026, 9, 5, 9, 30));
    expect(buildRescheduleDate(current, { date: "2026-10-05", hour: 14 })).toEqual(new Date(2026, 9, 5, 14, 0));
  });

  it("covers the whole visible month grid", () => {
    const { start, end } = getCalendarRange("month", new Date(2026, 9, 15));
    expect(start <= new Date(2026, 8, 28)).toBe(true);
    expect(end >= new Date(2026, 10, 1)).toBe(true);
  });
});
