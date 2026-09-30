import { beforeEach, describe, expect, it, vi } from "vitest";

const processDraftRun = vi.fn();
vi.mock("@/lib/qstash", () => ({ verifyScheduledRequest: async () => true }));
vi.mock("@/src/server/services/growth/draft-queue", () => ({ DRAFT_RETRIES: 3 }));
vi.mock("@/src/server/services/growth/service", () => {
  class RetryableDraftError extends Error {}
  return { processDraftRun, RetryableDraftError };
});

const { POST } = await import("@/app/api/qstash/generate-draft/route");
const { RetryableDraftError } = await import("@/src/server/services/growth/service");

const deliver = (retried = 0) => POST(new Request("https://cms.test/api/qstash/generate-draft", {
  method: "POST",
  headers: { "upstash-retried": String(retried) },
  body: JSON.stringify({ runId: "run-1" }),
}));

describe("Draft worker endpoint", () => {
  beforeEach(() => processDraftRun.mockReset());

  it("asks QStash to deliver again when the failure is worth retrying", async () => {
    processDraftRun.mockRejectedValueOnce(new RetryableDraftError("Overloaded"));
    expect((await deliver(0)).status).toBe(503);
    expect(processDraftRun).toHaveBeenCalledWith("run-1", { finalAttempt: false });
  });

  it("treats the last delivery as final", async () => {
    processDraftRun.mockResolvedValueOnce({ skipped: true });
    await deliver(3);
    expect(processDraftRun).toHaveBeenCalledWith("run-1", { finalAttempt: true });
  });

  it("does not retry failures that were already recorded", async () => {
    processDraftRun.mockRejectedValueOnce(new Error("Add an OpenAI API key"));
    const response = await deliver(0);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ failed: true });
  });

  it("rejects malformed payloads", async () => {
    const response = await POST(new Request("https://cms.test/api/qstash/generate-draft", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
  });
});
