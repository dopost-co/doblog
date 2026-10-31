import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const db = vi.hoisted(() => ({
  blog: { findFirst: vi.fn() },
  blogMember: { findFirst: vi.fn(), update: vi.fn() },
}));
const session = vi.hoisted(() => ({ current: { user: { id: "u-admin", email: "admin@example.com" } } as { user: { id: string; email: string } } | null }));
const seo = vi.hoisted(() => ({ upsert: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/get-session", () => ({ getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), cache: <T,>(fn: T) => fn }));

const { BLOG_PERMISSIONS, can, permissionsOf, roleApiScopes } = await import("@/lib/permissions");
const { getBlogRole, requireBlogPermission } = await import("@/src/server/services/blogs/access");
const { updateBlogMemberRole } = await import("@/src/server/services/blogs/members/mutations");
const { createMcpServer } = await import("@/lib/integrations/mcp");

describe("role matrix", () => {
  it("gives viewers reading only", () => {
    expect(can("viewer", "content.read")).toBe(true);
    expect(can("viewer", "autopilot.read")).toBe(true);
    expect(can("viewer", "content.write")).toBe(false);
    expect(can("viewer", "autopilot.write")).toBe(false);
  });

  it("lets members write content and work with ideas, but nothing critical", () => {
    expect(can("member", "content.write")).toBe(true);
    expect(can("member", "autopilot.write")).toBe(true);
    for (const permission of ["autopilot.manage", "blog.manage", "members.manage", "integrations.manage", "account.manage", "blog.delete"] as const) {
      expect(can("member", permission)).toBe(false);
    }
  });

  it("lets admins do everything in the blog but keeps the owner's account and deletion with the owner", () => {
    const adminCan = permissionsOf("admin");
    for (const [permission, definition] of Object.entries(BLOG_PERMISSIONS)) {
      expect(adminCan[permission as keyof typeof adminCan]).toBe(definition.minimum !== "owner");
    }
    expect(Object.values(permissionsOf("owner")).every(Boolean)).toBe(true);
    expect(Object.values(permissionsOf(null)).some(Boolean)).toBe(false);
  });

  it("caps API scopes by role", () => {
    expect(roleApiScopes("viewer")).toEqual(["content:read"]);
    expect(roleApiScopes("member")).toEqual(["content:read", "content:write", "content:publish", "content:delete", "media:write"]);
    expect(roleApiScopes("admin")).toContain("seo:write");
    expect(roleApiScopes("admin")).toContain("blog:write");
  });
});

describe("blog access", () => {
  beforeEach(() => {
    db.blog.findFirst.mockReset(); db.blogMember.findFirst.mockReset(); db.blogMember.update.mockReset();
    session.current = { user: { id: "u-admin", email: "admin@example.com" } };
  });

  it("resolves owner, invited role, unknown roles and no access", async () => {
    db.blog.findFirst.mockResolvedValueOnce({ userId: "u-owner", members: [] });
    expect(await getBlogRole("u-owner", "owner@example.com", "b")).toBe("owner");
    db.blog.findFirst.mockResolvedValueOnce({ userId: "u-owner", members: [{ role: "viewer" }] });
    expect(await getBlogRole("u-2", "Diego@Example.com", "b")).toBe("viewer");
    db.blog.findFirst.mockResolvedValueOnce({ userId: "u-owner", members: [{ role: "superuser" }] });
    expect(await getBlogRole("u-2", "x@example.com", "b")).toBe("viewer");
    db.blog.findFirst.mockResolvedValueOnce({ userId: "u-owner", members: [] });
    expect(await getBlogRole("u-3", "stranger@example.com", "b")).toBeNull();
    db.blog.findFirst.mockResolvedValueOnce(null);
    expect(await getBlogRole("u-owner", "owner@example.com", "deleted")).toBeNull();
  });

  it("refuses members what only admins can do, with a plain message", async () => {
    db.blog.findFirst.mockResolvedValue({ userId: "u-owner", members: [{ role: "member" }] });
    await expect(requireBlogPermission("b", "content.write")).resolves.toMatchObject({ role: "member" });
    await expect(requireBlogPermission("b", "autopilot.manage")).rejects.toMatchObject({ status: 403, message: "Only blog admins can do this" });
  });

  it("does not let admins demote themselves", async () => {
    db.blog.findFirst.mockResolvedValue({ userId: "u-owner", members: [{ role: "admin" }] });
    db.blogMember.findFirst.mockResolvedValue({ userEmail: "admin@example.com" });
    expect(await updateBlogMemberRole("b", "m-self", "member")).toEqual({ error: "Ask the owner or another admin to change your own role" });
    expect(db.blogMember.update).not.toHaveBeenCalled();
    db.blogMember.findFirst.mockResolvedValue({ userEmail: "diego@example.com" });
    expect(await updateBlogMemberRole("b", "m-diego", "viewer")).toEqual({ success: true, role: "viewer" });
    expect(await updateBlogMemberRole("b", "m-diego", "owner")).toMatchObject({ error: expect.stringContaining("viewer, member or admin") });
  });
});

describe("MCP connections follow each blog's role", () => {
  it("refuses settings changes on a blog where the person is only a member", async () => {
    const server = createMcpServer({
      blogId: "own", publicBlogId: "public-own", keyId: "oauth:test", scopes: ["content:read", "seo:write"],
      authorizedBlogs: [
        { blogId: "own", publicBlogId: "public-own", scopes: ["content:read", "seo:write"], canUsePaidSeo: true },
        { blogId: "shared", publicBlogId: "public-shared", scopes: ["content:read"], canUsePaidSeo: false },
      ],
    });
    const client = new Client({ name: "role-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const result = await client.callTool({ name: "seo_update_settings", arguments: { blogId: "public-shared", audience: "Founders" } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("Missing scope: seo:write");
    } finally { await client.close(); await server.close(); }
  });
});

describe("Autopilot spending stays with the owner", () => {
  const settingsInput = {
    credentialId: "someone-elses", enabled: true, targetDomain: "example.com", locationCode: 2724, languageCode: "es", timezone: "Europe/Madrid",
    competitorDomains: [], audience: "Founders", brandVoice: null, publishingMode: "review",
    thumbnailEnabled: true, inlineImagesEnabled: false, thumbnailFormat: "generated", thumbnailColors: [],
    thumbnailTypography: { font: "inter", size: "large", bold: true, align: "left" },
    logoUrl: null, thumbnailLogoPosition: "none", inlineLogoPosition: "none", thumbnailSize: "standard", inlineImageSize: "standard", internalLinksEnabled: true, backlinksEnabled: false,
    thumbnailReferenceUrls: [], inlineImageReferenceUrls: [], thumbnailStyle: null, inlineImageStyle: null,
    articleUrlPrefix: "/blog", articlePaths: {}, maxInlineImages: 2, perRunBudgetUsd: 50, dailyBudgetUsd: 500, monthlyBudgetUsd: 5000,
  };

  it("keeps research, connection and limits as the owner left them when another admin saves", async () => {
    vi.resetModules();
    vi.doMock("@/lib/prisma", () => ({ prisma: {
      blog: { findFirst: vi.fn()
        .mockResolvedValueOnce({ userId: "u-owner", members: [{ role: "admin" }] })
        .mockResolvedValueOnce({ id: "b", userId: "u-owner", name: "Blog", languages: ["es"], user: { plan: "lifetime" } }) },
      blogSeoSettings: seo,
      seoProviderCredential: { findMany: vi.fn() },
    } }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    const saved = { credentialId: "owner-connection", enabled: false, perRunBudgetUsdMicros: 250_000, dailyBudgetUsdMicros: 1_000_000, monthlyBudgetUsdMicros: 20_000_000 };
    seo.findUnique.mockResolvedValue(saved);
    const { saveBlogSeoSettings } = await import("@/src/server/services/seo/actions");
    const result = await saveBlogSeoSettings("b", settingsInput);
    expect(result).toEqual({ success: true });
    const { update } = seo.upsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(update).toMatchObject({ ...saved, audience: "Founders" });
  });
});
