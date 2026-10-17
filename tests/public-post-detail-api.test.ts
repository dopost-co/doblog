import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  blog: vi.fn(),
  postBySlug: vi.fn(),
  postBySlugAndLanguage: vi.fn(),
  translations: vi.fn(),
}));

vi.mock("@/src/server/services/blogs/queries", () => ({ getBlogByBlogId: mocks.blog }));
vi.mock("@/src/server/services/posts/queries", () => ({
  getPostBySlug: mocks.postBySlug,
  getPostBySlugAndLanguage: mocks.postBySlugAndLanguage,
  getPublishedTranslationsByGroup: mocks.translations,
}));

import { GET } from "@/app/api/blogs/[blogId]/posts/[slug]/route";

const post = {
  id: "post-en",
  title: "AI agents",
  slug: "ai-agents",
  content: { blocks: [] },
  excerpt: null,
  coverImage: null,
  language: "en",
  translationGroupId: "group",
  status: "published",
  featured: false,
  publishedAt: new Date("2026-10-01T10:00:00.000Z"),
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-01T10:00:00.000Z"),
  author: null,
  categories: [],
  tags: [],
  metaTitle: null,
  metaDescription: null,
  ogImage: null,
  ogTitle: null,
  ogDescription: null,
  canonicalUrl: null,
  keywords: null,
};

const request = (query = "") => GET(
  new NextRequest(`https://cms.example/api/blogs/test/posts/ai-agents${query}`),
  { params: Promise.resolve({ blogId: "test", slug: "ai-agents" }) }
);

beforeEach(() => {
  mocks.blog.mockReset().mockResolvedValue({ id: "internal-blog" });
  mocks.postBySlug.mockReset().mockResolvedValue(post);
  mocks.postBySlugAndLanguage.mockReset().mockResolvedValue(post);
  mocks.translations.mockReset().mockResolvedValue([
    { language: "en", slug: "ai-agents", canonicalUrl: null },
    { language: "es", slug: "agentes-ia", canonicalUrl: null },
  ]);
});

describe("public post detail API translations", () => {
  it("returns the post and its published translations with their own URLs", async () => {
    const response = await request("?language=en");
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.postBySlugAndLanguage).toHaveBeenCalledWith("internal-blog", "ai-agents", "en");
    expect(mocks.translations).toHaveBeenCalledWith("internal-blog", "group");
    expect(json.data.availableLanguages).toEqual(["en", "es"]);
    expect(json.data.translations).toEqual([
      { language: "en", slug: "ai-agents", canonicalUrl: null },
      { language: "es", slug: "agentes-ia", canonicalUrl: null },
    ]);
  });

  it("returns only the requested post when its translation group is null", async () => {
    mocks.postBySlug.mockResolvedValue({ ...post, translationGroupId: null });

    const response = await request();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.translations).not.toHaveBeenCalled();
    expect(json.data.availableLanguages).toEqual(["en"]);
    expect(json.data.translations).toEqual([
      { language: "en", slug: "ai-agents", canonicalUrl: null },
    ]);
  });
});
