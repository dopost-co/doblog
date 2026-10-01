import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ mediaAsset: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/r2", () => ({
  r2Client: { send: vi.fn() }, R2_BUCKET_NAME: "bucket", R2_PUBLIC_URL: "https://media.test",
  getBlogUploadPath: (blogId: string, file: string) => `blogs/${blogId}/${file}`,
  getPublicUrl: (path: string) => `https://media.test/${path}`,
}));

const { COVER_REFRESH_LIMIT, refreshableCoverPostIds } = await import("@/src/server/services/growth/cover-refresh");

/** A cover we generated, currently set on its post. */
const ours = (postId: string, url: string) => ({ postId, url, post: { coverImage: url } });

describe("choosing which covers to redraw", () => {
  beforeEach(() => db.mediaAsset.findMany.mockReset());

  it("redraws the covers this blog generated", async () => {
    db.mediaAsset.findMany.mockResolvedValue([ours("p1", "a.png"), ours("p2", "b.png")]);
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p1", "p2"]);
  });

  it("never replaces a cover the author set themselves", async () => {
    // The post now points somewhere else, so our asset is no longer its cover.
    db.mediaAsset.findMany.mockResolvedValue([
      { postId: "p1", url: "ours.png", post: { coverImage: "https://cdn.example/uploaded.jpg" } },
      ours("p2", "b.png"),
    ]);
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p2"]);
  });

  it("queues an article once even when it has several generated covers", async () => {
    // Only the newest asset is the post's current cover; earlier ones are history.
    db.mediaAsset.findMany.mockResolvedValue([
      ours("p1", "newest.png"),
      { postId: "p1", url: "older.png", post: { coverImage: "newest.png" } },
    ]);
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p1"]);
  });

  it("skips assets detached from any article", async () => {
    db.mediaAsset.findMany.mockResolvedValue([{ postId: null, url: "orphan.png", post: null }, ours("p2", "b.png")]);
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p2"]);
  });

  it("caps one pass so a large blog is not redrawn in a single bill", async () => {
    const many = Array.from({ length: COVER_REFRESH_LIMIT + 50 }, (_, i) => ours(`p${i}`, `${i}.png`));
    db.mediaAsset.findMany.mockResolvedValue(many);
    expect((await refreshableCoverPostIds("blog-1")).length).toBe(COVER_REFRESH_LIMIT);
    expect((await refreshableCoverPostIds("blog-1", 10)).length).toBe(10);
  });

  it("asks only for this blog's cover assets", async () => {
    db.mediaAsset.findMany.mockResolvedValue([]);
    await refreshableCoverPostIds("blog-1");
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ blogId: "blog-1", kind: "cover" }) }),
    );
  });
});
