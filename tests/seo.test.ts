import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { dataForSeoRequest, responseCostMicros } from "@/src/server/services/seo/dataforseo";
import { normalizeSeoResponse } from "@/src/server/services/seo/service";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("SEO provider security", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.INTEGRATION_ENCRYPTION_KEY; });

  it("encrypts secrets with authenticated encryption", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = TEST_KEY;
    const encrypted = encryptSecret("api-password");
    expect(encrypted).not.toContain("api-password");
    expect(decryptSecret(encrypted)).toBe("api-password");
    // Always change the last character (replacing it with "x" was a no-op 1 in 64 times).
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("x") ? "y" : "x"}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects missing encryption configuration", () => {
    expect(() => encryptSecret("secret")).toThrow(/INTEGRATION_ENCRYPTION_KEY/);
  });

  it("uses Basic authentication and accepts successful DataForSEO responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.002, result: [{}] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dataForSeoRequest({ login: "api-user", password: "api-pass" }, "/v3/test", [{ keyword: "seo" }]);
    expect(responseCostMicros(result)).toBe(2000);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("api-user:api-pass").toString("base64")}`);
  });

  it("does not accept provider-level error responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status_code: 40101, status_message: "Authentication failed" }), { status: 200 })));
    await expect(dataForSeoRequest({ login: "bad", password: "bad-password" }, "/v3/test")).rejects.toThrow("DataForSEO rejected the login");
  });

  it("normalizes keyword ideas from their documented top-level fields", () => {
    const normalized = normalizeSeoResponse("keyword_ideas", { tasks: [{ result: [{ total_count: 1, items: [{
      keyword: "automatización de redes sociales",
      keyword_info: { search_volume: 720, cpc: 1.2, competition_level: "MEDIUM" },
      keyword_properties: { keyword_difficulty: 34 },
      search_intent_info: { main_intent: "informational" },
    }] }] }] });
    expect(normalized).toEqual({ totalCount: 1, items: [{
      keyword: "automatización de redes sociales", searchVolume: 720, cpc: 1.2,
      competition: "MEDIUM", difficulty: 34, intent: "informational",
    }] });
  });
});
