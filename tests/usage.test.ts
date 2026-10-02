import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { costUsdMicros, priceFor, tokenUsage } = await import("@/src/server/services/usage/openai");
const { parseUsageMonth, recentUsageMonths } = await import("@/src/server/services/usage/queries");
const { isAdminEmail } = await import("@/lib/admin");
const { formatUsd } = await import("@/components/Usage/format");

describe("OpenAI cost estimates", () => {
  it("prices dated snapshots like their model and leaves unknown models unpriced", () => {
    expect(priceFor("gpt-4.1-mini-2025-04-14")).toEqual(priceFor("gpt-4.1-mini"));
    expect(priceFor("gpt-4.1-2025-04-14")?.input).toBe(2);
    expect(priceFor("some-new-model")).toBeNull();
  });

  it("charges cached input at the cached rate", () => {
    // 1,000 input of which 400 cached, 500 output on gpt-4.1-mini: 600×0.4 + 400×0.1 + 500×1.6
    expect(costUsdMicros("gpt-4.1-mini", { inputTokens: 1000, cachedInputTokens: 400, imageInputTokens: 0, outputTokens: 500 })).toBe(1080);
  });

  it("charges image input and the generated image at image rates", () => {
    // 100 text + 300 image input, 1,000 image output on gpt-image-1.5: 100×5 + 300×8 + 1000×32
    expect(costUsdMicros("gpt-image-1.5", { inputTokens: 400, cachedInputTokens: 0, imageInputTokens: 300, outputTokens: 1000 })).toBe(34_900);
  });

  it("reads usage from Responses, Chat Completions and Images bodies", () => {
    expect(tokenUsage({ usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 2 } } }))
      .toEqual({ inputTokens: 10, cachedInputTokens: 2, imageInputTokens: 0, outputTokens: 5 });
    expect(tokenUsage({ usage: { prompt_tokens: 7, completion_tokens: 3 } }))
      .toEqual({ inputTokens: 7, cachedInputTokens: 0, imageInputTokens: 0, outputTokens: 3 });
    expect(tokenUsage({ usage: { input_tokens: 50, output_tokens: 1056, input_tokens_details: { text_tokens: 20, image_tokens: 30 } } }))
      .toMatchObject({ imageInputTokens: 30, outputTokens: 1056 });
    expect(tokenUsage({ data: [] })).toBeNull();
  });
});

describe("usage months", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("reads a month from the URL and falls back to the current one", () => {
    expect(parseUsageMonth("2026-08", now)).toMatchObject({ key: "2026-08", label: "August 2026", start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-09-01T00:00:00Z") });
    expect(parseUsageMonth(undefined, now).key).toBe("2026-10");
    expect(parseUsageMonth("2026-13", now).key).toBe("2026-10");
    expect(parseUsageMonth("2027-01", now).key).toBe("2026-10");
  });

  it("lists the last months newest first across a year boundary", () => {
    expect(recentUsageMonths(12, now).map((month) => month.key).slice(-2)).toEqual(["2025-12", "2025-11"]);
  });
});

describe("admin and formatting", () => {
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it("recognizes administrators by email, ignoring case and spaces", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com , ops@example.com";
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("someone@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it("shows small provider amounts to a tenth of a cent", () => {
    expect(formatUsd(3_000)).toBe("$0.003");
    expect(formatUsd(12_400_000)).toBe("$12.40");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
