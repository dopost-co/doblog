import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), findBlog: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser }, blog: { findUnique: mocks.findBlog } } }));
vi.mock("@/lib/crypto/secrets", () => ({ decryptSecret: (value: string) => `decrypted:${value}` }));
import { resolveDataForSeoAccess, resolveOpenAiAccess } from "@/src/server/services/providers/credentials";

describe("provider credentials by plan", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("OPENAI_API_KEY", "platform-openai");
    vi.stubEnv("DATAFORSEO_LOGIN", "platform-login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "platform-password");
  });

  it("bills lifetime users to their own OpenAI key, never the platform's", async () => {
    mocks.findUser.mockResolvedValue({ plan: "lifetime", openaiApiKeyEncrypted: "enc" });
    await expect(resolveOpenAiAccess("u")).resolves.toEqual({ apiKey: "decrypted:enc", paidBy: "owner" });

    mocks.findUser.mockResolvedValue({ plan: "lifetime", openaiApiKeyEncrypted: null });
    await expect(resolveOpenAiAccess("u")).rejects.toMatchObject({ status: 412 });
  });

  it("uses the platform key for subscribers", async () => {
    mocks.findUser.mockResolvedValue({ plan: "subscription", openaiApiKeyEncrypted: "enc" });
    await expect(resolveOpenAiAccess("u")).resolves.toEqual({ apiKey: "platform-openai", paidBy: "platform" });
  });

  it("resolves DataForSEO from the blog's connection or the platform account", async () => {
    mocks.findBlog.mockResolvedValue({ user: { plan: "lifetime" }, seoSettings: { credential: { id: "c1", verifiedAt: new Date(), encryptedLogin: "l", encryptedPassword: "p" } } });
    await expect(resolveDataForSeoAccess("b")).resolves.toEqual({ credentialId: "c1", login: "decrypted:l", password: "decrypted:p", cacheScope: "c1" });

    mocks.findBlog.mockResolvedValue({ user: { plan: "lifetime" }, seoSettings: null });
    await expect(resolveDataForSeoAccess("b")).rejects.toMatchObject({ status: 409 });

    mocks.findBlog.mockResolvedValue({ user: { plan: "subscription" }, seoSettings: null });
    await expect(resolveDataForSeoAccess("b")).resolves.toEqual({ credentialId: null, login: "platform-login", password: "platform-password", cacheScope: "platform" });
  });
});
