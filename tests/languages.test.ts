import { afterEach, expect, it, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findMany } } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
import { getPublishedLanguagesByGroup, getPublishedTranslationsByGroup } from "@/src/server/services/posts/queries";

afterEach(() => {
  findMany.mockReset();
});

it("batches translation lookups, scoped to the blog and published posts", async () => {
  findMany.mockResolvedValue([
    { translationGroupId: "g1", language: "en" },
    { translationGroupId: "g1", language: "es" },
    { translationGroupId: "g1", language: "es" },
    { translationGroupId: "g2", language: "pt" },
  ]);
  expect(await getPublishedLanguagesByGroup("blog", ["g2", "g1", "g1"])).toEqual({ g1: ["en", "es"], g2: ["pt"] });
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blogId: "blog", status: "published", translationGroupId: { in: ["g1", "g2"] } } }));
});
it("does not query translations when no groups exist", async () => {
  expect(await getPublishedLanguagesByGroup("blog", [])).toEqual({});
  expect(findMany).not.toHaveBeenCalled();
});

it("returns public translation URLs scoped to one blog, group, and published status", async () => {
  findMany.mockResolvedValue([
    { language: "en", slug: "ai-agents", canonicalUrl: null },
    { language: "es", slug: "agentes-ia", canonicalUrl: "https://example.com/es/agentes-ia" },
  ]);

  await expect(getPublishedTranslationsByGroup("blog", "group")).resolves.toEqual([
    { language: "en", slug: "ai-agents", canonicalUrl: null },
    { language: "es", slug: "agentes-ia", canonicalUrl: "https://example.com/es/agentes-ia" },
  ]);
  expect(findMany).toHaveBeenCalledWith({
    where: { blogId: "blog", status: "published", translationGroupId: "group" },
    select: { language: true, slug: true, canonicalUrl: true },
    orderBy: { language: "asc" },
  });
});
