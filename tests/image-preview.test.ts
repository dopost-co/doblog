import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ post: { findFirst: vi.fn() } }));
const resolveKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/services/providers/credentials", () => ({ resolveBlogOpenAiKey: resolveKey }));
vi.mock("@/lib/r2", () => ({
  r2Client: { send: vi.fn() }, R2_BUCKET_NAME: "bucket", R2_PUBLIC_URL: "https://media.test",
  getBlogUploadPath: (blogId: string, file: string) => `blogs/${blogId}/${file}`,
  getPublicUrl: (path: string) => `https://media.test/${path}`,
}));

const { previewImage } = await import("@/src/server/services/growth/image-preview");

describe("Image previews", () => {
  beforeEach(() => { db.post.findFirst.mockReset(); resolveKey.mockReset(); });

  it("makes a brand card from an article without AI and returns it without storing it", async () => {
    db.post.findFirst.mockResolvedValue({ title: "Planning a content month", excerpt: null, content: null, blog: { name: "Zenex" } });
    const result = await previewImage("blog-1", { kind: "cover", postId: "post-1", format: "template", colors: ["#1e1b4b", "#6d28d9"] });
    expect(result.image.startsWith("data:image/png;base64,")).toBe(true);
    expect(resolveKey).not.toHaveBeenCalled();
    // Only articles of this blog can be used.
    expect(db.post.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "post-1", blogId: "blog-1" } }));
  }, 20_000);

  it("rejects articles from other blogs and references it did not upload", async () => {
    db.post.findFirst.mockResolvedValue(null);
    await expect(previewImage("blog-1", { kind: "cover", postId: "other", format: "template" })).rejects.toThrow("Article not found");

    db.post.findFirst.mockResolvedValue({ title: "T", excerpt: null, content: null, blog: { name: "Zenex" } });
    resolveKey.mockResolvedValue("sk-test");
    await expect(previewImage("blog-1", { kind: "inline", postId: "post-1", referenceUrls: ["https://evil.test/x.png"] })).rejects.toThrow("Upload style references through Zenex");
  });
});
