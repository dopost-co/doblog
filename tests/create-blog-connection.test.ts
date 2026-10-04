import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("Creating a blog from MCP", () => {
  it("needs an OAuth connection, not a blog API key", async () => {
    const { createBlogForConnection } = await import("@/src/server/services/blogs/connection-setup");
    await expect(createBlogForConnection({ blogId: "b", publicBlogId: "p", keyId: "key_123", scopes: ["content:write", "seo:write"] }, { name: "New" }))
      .rejects.toThrow("OAuth connection");
  });

  it("checks the input before touching anything", async () => {
    const { createBlogInputSchema } = await import("@/src/server/services/blogs/connection-setup");
    expect(createBlogInputSchema.parse({ name: "YeclaJob" }).languages).toEqual(["en"]);
    expect(createBlogInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createBlogInputSchema.safeParse({ name: "x", extra: true }).success).toBe(false);
  });
});
