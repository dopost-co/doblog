import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { dataForSeoRequest, responseCostMicros } from "@/src/server/services/seo/dataforseo";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("SEO provider security", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.INTEGRATION_ENCRYPTION_KEY; });

  it("encrypts secrets with authenticated encryption", () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = TEST_KEY;
    const encrypted = encryptSecret("api-password");
    expect(encrypted).not.toContain("api-password");
    expect(decryptSecret(encrypted)).toBe("api-password");
    expect(() => decryptSecret(`${encrypted.slice(0, -1)}x`)).toThrow();
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
    await expect(dataForSeoRequest({ login: "bad", password: "bad-password" }, "/v3/test")).rejects.toThrow("Authentication failed");
  });
});
