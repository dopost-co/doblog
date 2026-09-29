import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), translateText: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: { findFirst: mocks.findFirst },
    $transaction: (run: (tx: unknown) => unknown) => run({ post: { create: mocks.create, update: vi.fn() } }),
  },
}));
vi.mock("@/src/server/services/translations/TranslationService", () => ({
  TranslationService: class {
    isConfigured = true;
    translateText = mocks.translateText;
    translatePostContent = async (content: unknown) => content;
  },
}));
import { translatePostInto } from "@/src/server/services/translations/post-translation";

const source = {
  id: "p", blogId: "b", language: "es", translationGroupId: "g", slug: "s", title: "Título", content: { blocks: [] },
  excerpt: null, metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null, keywords: null,
  coverImage: null, ogImage: null, canonicalUrl: null, status: "scheduled", featured: false,
  publishedAt: new Date("2026-10-09T07:00:00Z"), authorId: null, categories: [], tags: [],
};

describe("translatePostInto", () => {
  it("reports each language separately: created, skipped and failed", async () => {
    mocks.findFirst.mockImplementation(async ({ where }) => {
      if (where.id) return source;
      return where.language === "en" ? { id: "existing-en" } : null;
    });
    mocks.translateText.mockImplementation(async (_text: string, language: string) => {
      if (language === "fr") throw new Error("provider timeout");
      return `Titolo (${language})`;
    });
    mocks.create.mockImplementation(async ({ data }) => ({ id: `new-${data.language}`, ...data }));

    const result = await translatePostInto("b", "p", ["en", "fr", "it"]);

    expect(result.skipped).toEqual([{ language: "en", reason: expect.stringContaining("already exists") }]);
    expect(result.failed).toEqual([{ language: "fr", error: expect.stringContaining("retry") }]);
    expect(result.created).toEqual([{ language: "it", id: "new-it", title: "Titolo (it)", status: "scheduled" }]);
    // Translations keep the source's schedule so they go live together.
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ slug: "s", status: "scheduled", publishedAt: source.publishedAt });
  });

  it("fails fast when the post does not exist", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(translatePostInto("b", "missing", ["en"])).rejects.toMatchObject({ status: 404 });
  });
});
