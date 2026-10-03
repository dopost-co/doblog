import { afterEach, describe, expect, it, vi } from "vitest";

const openAi = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("openai", async (original) => {
  const actual = await original<typeof import("openai")>();
  class FakeOpenAI { models = { list: openAi.list }; static AuthenticationError = actual.default.AuthenticationError; static PermissionDeniedError = actual.default.PermissionDeniedError; static APIError = actual.default.APIError; }
  return { ...actual, default: FakeOpenAI };
});
const { dataForSeoRequest } = await import("@/src/server/services/seo/dataforseo");
const { checkPlatformProviders } = await import("@/src/server/services/admin/provider-health");

const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const userData = (balance: number) => ({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ money: { balance } }] }] });

afterEach(() => {
  vi.unstubAllGlobals(); openAi.list.mockReset();
  delete process.env.OPENAI_API_KEY; delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
});

describe("DataForSEO errors", () => {
  const credentials = { login: "a", password: "b" };

  it("explains an empty balance, a wrong login and a rate limit", async () => {
    vi.stubGlobal("fetch", reply({ status_code: 20000, tasks: [{ status_code: 40200, status_message: "Payment Required." }] }));
    await expect(dataForSeoRequest(credentials, "/v3/x", [{}])).rejects.toMatchObject({ status: 402, message: expect.stringContaining("balance is used up") });
    vi.stubGlobal("fetch", reply({ status_code: 40100, status_message: "You are not authorized" }, 401));
    await expect(dataForSeoRequest(credentials, "/v3/x")).rejects.toMatchObject({ status: 401, message: expect.stringContaining("API password") });
    vi.stubGlobal("fetch", reply({ status_code: 40202, status_message: "Rate limit" }));
    await expect(dataForSeoRequest(credentials, "/v3/x")).rejects.toMatchObject({ status: 429 });
  });

  it("reports a timeout instead of a raw abort", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    await expect(dataForSeoRequest(credentials, "/v3/x")).rejects.toMatchObject({ status: 504, message: expect.stringContaining("25 seconds") });
  });
});

describe("platform provider health", () => {
  it("says what is missing without calling anything", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const health = await checkPlatformProviders();
    expect(health.openai.status).toBe("missing");
    expect(health.dataforseo.status).toBe("missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports working keys with the DataForSEO balance, flagging low and empty balances", async () => {
    process.env.OPENAI_API_KEY = "sk-test"; process.env.DATAFORSEO_LOGIN = "a"; process.env.DATAFORSEO_PASSWORD = "b";
    openAi.list.mockResolvedValue({});
    vi.stubGlobal("fetch", reply(userData(42.5)));
    expect(await checkPlatformProviders()).toEqual({ openai: { status: "ok" }, dataforseo: { status: "ok", balanceUsd: 42.5, low: false } });
    vi.stubGlobal("fetch", reply(userData(0.97)));
    expect((await checkPlatformProviders()).dataforseo).toEqual({ status: "ok", balanceUsd: 0.97, low: true });
    vi.stubGlobal("fetch", reply(userData(0)));
    expect((await checkPlatformProviders()).dataforseo.status).toBe("no_credit");
  });

  it("tells rejected credentials apart from an unreachable service", async () => {
    process.env.DATAFORSEO_LOGIN = "a"; process.env.DATAFORSEO_PASSWORD = "wrong";
    vi.stubGlobal("fetch", reply({ status_code: 40100, status_message: "You are not authorized" }, 401));
    expect((await checkPlatformProviders()).dataforseo.status).toBe("rejected");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await checkPlatformProviders()).dataforseo.status).toBe("unreachable");
  });
});
