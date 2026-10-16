import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const db = vi.hoisted(() => ({ post: { findFirst: vi.fn() } }));
const r2 = vi.hoisted(() => ({ send: vi.fn() }));
const images = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/r2", () => ({
  r2Client: r2, R2_BUCKET_NAME: "bucket", R2_PUBLIC_URL: "https://media.test",
  getBlogUploadPath: (blogId: string, file: string) => `blogs/${blogId}/${file}`,
  getPublicUrl: (path: string) => `https://media.test/${path}`,
}));
vi.mock("@/src/server/services/usage/openai", () => ({ blogOpenAI: async () => ({ images: { generate: images.generate } }) }));

const { previewImage } = await import("@/src/server/services/growth/image-preview");

const red = { r: 220, g: 20, b: 60 };
const pixel = async (dataUrl: string, left: number, top: number) => {
  const { data } = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).extract({ left, top, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return [...data].slice(0, 3);
};

describe("logo on post images", () => {
  db.post.findFirst.mockResolvedValue({ title: "Planning", excerpt: null, content: null, blog: { name: "Zenex" } });
  const logoUrl = "https://media.test/blogs/blog-1/brand/logo.png";

  it("stamps the logo on an in-article preview where it was asked for", async () => {
    const white = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#ffffff" } }).webp().toBuffer();
    images.generate.mockResolvedValue({ data: [{ b64_json: white.toString("base64") }] });
    const logo = await sharp({ create: { width: 400, height: 200, channels: 4, background: { ...red, alpha: 1 } } }).png().toBuffer();
    r2.send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array(logo) }, ContentType: "image/png" });

    const result = await previewImage("blog-1", {
      kind: "inline", postId: "post-1", logoUrl, logoPosition: "top-left",
      style: "ARTICLE\n[TITLE]", conceptPrompt: "Make [TITLE] immediately understandable.",
      model: "gpt-image-2", quality: "low",
    });
    expect(result.warnings).toEqual([]);
    expect(images.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", quality: "low", n: 1 }));
    expect(images.generate.mock.calls[0][0].prompt).toContain("Make Planning immediately understandable.");
    expect(images.generate.mock.calls[0][0].prompt).toContain("ARTICLE\nPlanning");
    const [r, g, b] = await pixel(result.image, 80, 80);
    expect(Math.abs(r - red.r) + Math.abs(g - red.g) + Math.abs(b - red.b)).toBeLessThan(15);
    // The opposite corner stays untouched, at the Standard 1200×675 size.
    expect(await pixel(result.image, 1150, 640)).toEqual([255, 255, 255]);
  });

  it("says so when the logo file can't be read instead of leaving it out silently", async () => {
    r2.send.mockRejectedValue(new Error("NoSuchKey"));
    const result = await previewImage("blog-1", { kind: "inline", postId: "post-1", logoUrl, logoPosition: "top-left" });
    expect(result.warnings).toEqual([expect.stringContaining("logo could not be loaded")]);
  });
});
