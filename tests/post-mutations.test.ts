import { beforeEach, describe, expect, it, vi } from "vitest";
import { postCreateSchema, postUpdateSchema } from "@/lib/integrations/schemas";
import { ApiError } from "@/lib/integrations/errors";

const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  recordBlogId: vi.fn(),
  findPost: vi.fn(),
  findPosts: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findFirst: mocks.findPost, findMany: mocks.findPosts } } }));
vi.mock("@/lib/get-session", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/src/server/services/content/dashboard", () => ({ dashboardOperation: mocks.operation, recordBlogId: mocks.recordBlogId }));
import { createPost, deletePostTranslations, updatePost, updatePostTranslations } from "@/src/server/services/posts/mutations";

describe("dashboard post payloads", () => {
  beforeEach(() => {
    mocks.operation.mockReset();
    mocks.recordBlogId.mockReset();
    mocks.recordBlogId.mockResolvedValue("actual-blog");
    mocks.findPost.mockReset();
    mocks.findPosts.mockReset();
    mocks.operation.mockImplementation(async (_blogId, operation, input) => {
      if (operation === "create_posts") return { id: "post", ...postCreateSchema.parse(input) };
      if (operation === "delete_posts") return { id: (input as { id: string }).id, deleted: true };
      const { id, ...fields } = input;
      return { id, ...postUpdateSchema.parse(fields) };
    });
  });

  it("accepts older edit forms without trusting their blogId or weakening validation", async () => {
    const input = { blogId: "different-blog", title: "Updated", publishedAt: new Date("2026-08-31T12:00:00Z") };
    const result = await updatePost("post", input);
    expect(result.error).toBeUndefined();
    expect(mocks.operation).toHaveBeenCalledWith("actual-blog", "update_posts", {
      id: "post", title: "Updated", publishedAt: "2026-08-31T12:00:00.000Z",
    });
    expect(input.blogId).toBe("different-blog");
    const invalidInput = { title: "Updated", unexpected: true };
    expect((await updatePost("post", invalidInput)).error).toContain('Unrecognized key: "unexpected"');
  });

  it("supports current edit forms and still propagates denied access", async () => {
    expect((await updatePost("post", { title: "Updated" })).error).toBeUndefined();
    mocks.operation.mockRejectedValueOnce(new ApiError(403, "Unauthorized"));
    expect((await updatePost("post", { title: "Denied", blogId: "different-blog" })).error).toBe("Unauthorized");
  });

  it("passes blogId only as the creation context and retains table data", async () => {
    const content = { blocks: [{ type: "table", data: { withHeadings: true, content: [["Heading"], ["Value"]] } }] };
    const result = await createPost({ blogId: "actual-blog", title: "New", slug: "new", language: "en", content });
    expect(result.error).toBeUndefined();
    expect(result.post?.content).toEqual(content);
    expect(mocks.operation.mock.calls[0][2]).not.toHaveProperty("blogId");
  });

  it("updates list-level fields across every translation in the same blog", async () => {
    mocks.findPost.mockResolvedValue({ translationGroupId: "group-1" });
    mocks.findPosts.mockResolvedValue([{ id: "post-es" }, { id: "post-en" }, { id: "post-fr" }]);

    const result = await updatePostTranslations("post-es", { status: "published", featured: true });

    expect(result).toMatchObject({ success: true, affectedCount: 3 });
    expect(mocks.findPosts).toHaveBeenCalledWith(expect.objectContaining({
      where: { blogId: "actual-blog", translationGroupId: "group-1" },
    }));
    expect(mocks.operation.mock.calls).toEqual([
      ["actual-blog", "update_posts", { id: "post-es", status: "published", featured: true }],
      ["actual-blog", "update_posts", { id: "post-en", status: "published", featured: true }],
      ["actual-blog", "update_posts", { id: "post-fr", status: "published", featured: true }],
    ]);
  });

  it("deletes every translation and falls back to the selected post without a group", async () => {
    mocks.findPost.mockResolvedValueOnce({ translationGroupId: "group-1" });
    mocks.findPosts.mockResolvedValueOnce([{ id: "post-es" }, { id: "post-en" }]);
    expect(await deletePostTranslations("post-es")).toMatchObject({ success: true, affectedCount: 2 });
    expect(mocks.operation.mock.calls).toEqual([
      ["actual-blog", "delete_posts", { id: "post-es" }],
      ["actual-blog", "delete_posts", { id: "post-en" }],
    ]);

    mocks.operation.mockClear();
    mocks.findPost.mockResolvedValueOnce({ translationGroupId: null });
    expect(await deletePostTranslations("standalone")).toMatchObject({ success: true, affectedCount: 1 });
    expect(mocks.operation).toHaveBeenCalledOnce();
    expect(mocks.operation).toHaveBeenCalledWith("actual-blog", "delete_posts", { id: "standalone" });
  });
});
