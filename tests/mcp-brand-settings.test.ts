import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  blog: { findFirst: vi.fn(), update: vi.fn() },
  blogSeoSettings: { updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/r2", () => ({
  r2Client: { send: vi.fn() }, R2_BUCKET_NAME: "bucket", R2_PUBLIC_URL: "https://media.test",
  getBlogUploadPath: (blogId: string, file: string) => `blogs/${blogId}/${file}`,
  getPublicUrl: (path: string) => `https://media.test/${path}`,
}));

const { executeOperation } = await import("@/src/server/services/content/service");
const { updateSeoEditorialSettings } = await import("@/src/server/services/seo/service");
const { blogUpdateSchema } = await import("@/lib/integrations/schemas");
const { discoverySettingsSchema } = await import("@/src/server/services/growth/discovery");

const principal = { blogId: "blog-1", publicBlogId: "public-1", scopes: ["blog:write"] } as never;

describe("Blog languages over the API and MCP", () => {
  beforeEach(() => { db.blog.findFirst.mockReset(); db.blog.update.mockReset(); db.blogSeoSettings.updateMany.mockReset(); });

  it("validates languages", () => {
    expect(blogUpdateSchema.safeParse({ languages: ["es", "en"], autoSyncTranslations: true }).success).toBe(true);
    expect(blogUpdateSchema.safeParse({ languages: ["xx"] }).success).toBe(false);
    expect(blogUpdateSchema.safeParse({ languages: [] }).success).toBe(false);
  });

  it("turns sync off with one language and moves Autopilot to the new main language", async () => {
    db.blog.findFirst.mockResolvedValue({ id: "blog-1", userId: "u", languages: ["en", "es"], autoSyncTranslations: true });
    db.blog.update.mockImplementation(async ({ data }: { data: unknown }) => data);
    const { data } = await executeOperation(principal, "update_blog", { languages: ["es"] }) as unknown as { data: { languages: string[]; autoSyncTranslations: boolean } };
    expect(data).toMatchObject({ languages: ["es"], autoSyncTranslations: false });
    expect(db.blogSeoSettings.updateMany).toHaveBeenCalledWith({ where: { blogId: "blog-1" }, data: { languageCode: "es" } });
  });
});

describe("Brand assets over MCP", () => {
  it("only accepts the blog's own logo and references", async () => {
    await expect(updateSeoEditorialSettings("blog-1", { logoUrl: "https://evil.test/logo.png" })).rejects.toThrow("Upload the logo through Zenex");
    await expect(updateSeoEditorialSettings("blog-1", { thumbnailReferenceUrls: ["https://media.test/blogs/blog-2/references/a.png"] })).rejects.toThrow();
  });

  it("merges partial brand card text settings with the saved ones", async () => {
    db.blogSeoSettings.findUnique.mockResolvedValueOnce({ thumbnailTypography: { font: "playfair-display", size: "large" } }).mockResolvedValue(null);
    db.blogSeoSettings.upsert.mockResolvedValue({});
    db.blog.findFirst.mockResolvedValue({ user: { plan: "free" } });
    await updateSeoEditorialSettings("blog-1", { thumbnailTypography: { bold: false } });
    expect(db.blogSeoSettings.upsert.mock.calls[0][0].update.thumbnailTypography).toEqual({
      font: "playfair-display", size: "large", bold: false, align: "left", showBlogName: false,
    });
    await expect(updateSeoEditorialSettings("blog-1", { thumbnailTypography: { font: "comic-sans" } })).rejects.toThrow();
  });

  it("can pause Autopilot while configuring it", () => {
    expect(discoverySettingsSchema.safeParse({ website: "https://example.com", frequency: "weekly", topicsPerRun: 8, writingDays: [1], active: false }).success).toBe(true);
  });
});
