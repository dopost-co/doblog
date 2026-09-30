import { beforeAll, describe, expect, it, vi } from "vitest";

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
    const { requestImage } = await import("@/src/server/services/growth/service");
    const edit = vi.fn().mockResolvedValue(image);
    const generate = vi.fn();
    const reference = new File([new Uint8Array([1])], "ref.png", { type: "image/png" });
    await requestImage({ images: { edit, generate } } as never, "A cover", [reference], "run-1");
    expect(generate).not.toHaveBeenCalled();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ image: [reference], input_fidelity: "high", prompt: "A cover", output_format: "webp" }));
  });

  it("generates from text when there are no references, or the edit fails", async () => {
    const { requestImage } = await import("@/src/server/services/growth/service");
    const generate = vi.fn().mockResolvedValue(image);
    await requestImage({ images: { edit: vi.fn(), generate } } as never, "A cover", [], "run-1");
    expect(generate).toHaveBeenCalledTimes(1);

    const failingEdit = vi.fn().mockRejectedValue(new Error("unsupported"));
    const fallback = vi.fn().mockResolvedValue(image);
    const reference = new File([new Uint8Array([1])], "ref.png", { type: "image/png" });
    expect(await requestImage({ images: { edit: failingEdit, generate: fallback } } as never, "A cover", [reference], "run-1")).toBe(image);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
