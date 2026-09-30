import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { ApiError } from "@/lib/integrations/errors";
import { isRetryable } from "@/src/server/services/growth/service";

describe("Draft generation retries", () => {
  it("does not retry problems a new delivery cannot fix", () => {
    expect(isRetryable(new ApiError(412, "Add an OpenAI API key"))).toBe(false);
    expect(isRetryable(new ApiError(404, "Plan item not found"))).toBe(false);
    expect(isRetryable(new OpenAI.APIError(401, undefined, "Invalid key", undefined))).toBe(false);
  });

  it("retries rate limits, provider outages and unexpected failures", () => {
    expect(isRetryable(new ApiError(429, "Too many requests"))).toBe(true);
    expect(isRetryable(new ApiError(502, "The AI could not produce an article"))).toBe(true);
    expect(isRetryable(new OpenAI.APIError(503, undefined, "Overloaded", undefined))).toBe(true);
    expect(isRetryable(new Error("socket hang up"))).toBe(true);
  });
});
