import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { imageSize } from "@/lib/autopilot/image-sizes";

vi.mock("@/lib/r2", () => ({
  r2Client: { send: vi.fn() },
  R2_BUCKET_NAME: "bucket",
  R2_PUBLIC_URL: "https://media.test",
  getBlogUploadPath: (blogId: string, file: string) => `blogs/${blogId}/${file}`,
  getPublicUrl: (path: string) => `https://media.test/${path}`,
}));

let normalizeStyleReferences: typeof import("@/src/server/services/growth/image-references").normalizeStyleReferences;
beforeAll(async () => {
  ({ normalizeStyleReferences } = await import("@/src/server/services/growth/image-references"));
});

const ref = (blogId: string, name = "a1b2.png") => `https://media.test/blogs/${blogId}/references/${name}`;

describe("Style references", () => {
  it("keeps the blog's own references, without duplicates", () => {
    expect(normalizeStyleReferences("blog-1", [ref("blog-1"), ref("blog-1"), " "])).toEqual([ref("blog-1")]);
  });

  it("rejects images from other blogs, other folders or other hosts", () => {
    expect(() => normalizeStyleReferences("blog-1", [ref("blog-2")])).toThrow();
    expect(() => normalizeStyleReferences("blog-1", ["https://media.test/blogs/blog-1/cover.png"])).toThrow();
    expect(() => normalizeStyleReferences("blog-1", ["https://evil.test/blogs/blog-1/references/a.png"])).toThrow();
    expect(() => normalizeStyleReferences("blog-1", [ref("blog-1", "../../secret.png")])).toThrow();
  });

  it("accepts at most two", () => {
    expect(() => normalizeStyleReferences("blog-1", [ref("blog-1", "a.png"), ref("blog-1", "b.png"), ref("blog-1", "c.png")])).toThrow("up to 2");
  });
});

describe("Image generation with references", () => {
  const image = { data: [{ b64_json: "aW1n" }] };

  it("sends the references to the edit endpoint with high input fidelity", async () => {
    const { requestImage } = await import("@/src/server/services/growth/images");
    const edit = vi.fn().mockResolvedValue(image);
    const generate = vi.fn();
    const reference = new File([new Uint8Array([1])], "ref.png", { type: "image/png" });
    await requestImage({ images: { edit, generate } } as never, "A cover", [reference], "run-1");
    expect(generate).not.toHaveBeenCalled();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ image: [reference], input_fidelity: "high", prompt: "A cover", output_format: "webp" }));
  });

  it("generates from text when there are no references, or the edit fails", async () => {
    const { requestImage } = await import("@/src/server/services/growth/images");
    const generate = vi.fn().mockResolvedValue(image);
    await requestImage({ images: { edit: vi.fn(), generate } } as never, "A cover", [], "run-1");
    expect(generate).toHaveBeenCalledTimes(1);

    const failingEdit = vi.fn().mockRejectedValue(new Error("unsupported"));
    const fallback = vi.fn().mockResolvedValue(image);
    const reference = new File([new Uint8Array([1])], "ref.png", { type: "image/png" });
    expect(await requestImage({ images: { edit: failingEdit, generate: fallback } } as never, "A cover", [reference], "run-1")).toBe(image);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("detects transparent styles but keeps gpt-image-2 requests opaque", async () => {
    const { requestImage, wantsTransparentBackground, makeCover } = await import("@/src/server/services/growth/images");
    expect(wantsTransparentBackground("Like a kid draw black and white with bg transparent")).toBe(true);
    expect(wantsTransparentBackground("Ilustración con fondo transparente")).toBe(true);
    expect(wantsTransparentBackground("Flat icon, no background")).toBe(true);
    expect(wantsTransparentBackground("Editorial watercolor, warm palette")).toBe(false);
    expect(wantsTransparentBackground(null)).toBe(false);
    // Negated mentions ask for the opposite.
    expect(wantsTransparentBackground("Minimal line art and a completely solid white background (#FFFFFF) covering the entire canvas. No transparency, no alpha channel, no cutout, and no shadows.")).toBe(false);
    expect(wantsTransparentBackground("Fondo blanco, sin transparencias")).toBe(false);
    expect(wantsTransparentBackground("Avoid cutouts; keep a white background")).toBe(false);
    expect(wantsTransparentBackground("Sticker style cut-out, not a photo")).toBe(true);
    expect(wantsTransparentBackground("No shadows, transparent background")).toBe(true);

    // gpt-image-2 does not support alpha, so unsupported background and PNG
    // overrides are omitted even if a caller asks for transparency directly.
    const generate = vi.fn().mockResolvedValue(image);
    await requestImage({ images: { edit: vi.fn(), generate } } as never, "A cover", [], "run-1", { format: "jpeg", size: "1024x1024", transparent: true });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", output_format: "jpeg" }));
    expect(generate.mock.calls[0][0]).not.toHaveProperty("background");

    const cover = vi.fn().mockResolvedValue(image);
    const made = await makeCover({ images: { edit: vi.fn(), generate: cover } } as never, {
      format: "generated", prompt: "A cover", style: "Like a kid draw black and white with bg transparent", references: [], runId: "run-1",
      colors: [], typography: {} as never, title: "T", warnings: [], size: imageSize("original"),
    });
    expect(cover).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2", output_format: "webp" }));
    expect(cover.mock.calls[0][0]).not.toHaveProperty("background");
    expect(cover.mock.calls[0][0].prompt).not.toContain("Never draw a checkerboard");
    expect(made.mimeType).toBe("image/webp");

    const plain = vi.fn().mockResolvedValue(image);
    await makeCover({ images: { edit: vi.fn(), generate: plain } } as never, {
      format: "generated", prompt: "A cover", style: "Warm watercolor", references: [], runId: "run-1",
      colors: [], typography: {} as never, title: "T", warnings: [], size: imageSize("original"),
    });
    expect(plain.mock.calls[0][0]).not.toHaveProperty("background");
  });

  it("draws at the nearest model size and crops to the chosen preset", async () => {
    const { makeInlineImage } = await import("@/src/server/services/growth/images");
    const drawn = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#336699" } }).webp().toBuffer();
    const generate = vi.fn().mockResolvedValue({ data: [{ b64_json: drawn.toString("base64") }] });
    const made = await makeInlineImage({ images: { edit: vi.fn(), generate } } as never, {
      prompt: "A chart", references: [], runId: "run-1", size: imageSize("standard"),
    });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ size: "1536x1024", prompt: expect.stringContaining("16:9 landscape") }));
    expect(await sharp(made.bytes).metadata()).toMatchObject({ width: 1200, height: 675, format: "webp" });
  });
});
