import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), translateText: vi.fn(), resolveKey: vi.fn(async () => "owner-key") }));
vi.mock("@/src/server/services/providers/credentials", () => ({ resolveBlogOpenAiAccess: mocks.resolveKey }));
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
import { rewriteLinks, translatableTextChanged, translatePostInto } from "@/src/server/services/translations/post-translation";

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

  it("stops for every language when the owner has no AI key", async () => {
    const { ApiError } = await import("@/lib/integrations/errors");
    mocks.findFirst.mockImplementation(async ({ where }) => (where.id ? source : null));
    mocks.resolveKey.mockRejectedValueOnce(new ApiError(412, "Add an OpenAI API key in Settings → Providers to use AI features"));
    await expect(translatePostInto("b", "p", ["en", "it"])).rejects.toMatchObject({ status: 412 });
  });
});

describe("rewriteLinks", () => {
  it("rewrites the longest matching prefix and leaves other links alone", () => {
    const content = { blocks: [
      { type: "paragraph", data: { text: 'See <a href="/es/productos/silla">this</a>, <a href="/es/blog/x">that</a> and <a href="https://example.com">out</a>' } },
      { type: "linkTool", data: { link: "/es/contacto" } },
    ] };
    const out = rewriteLinks(content, { "/es/": "/en/", "/es/productos": "/en/products", "/es/contacto": "/en/contact" });
    expect(out.blocks[0].data.text).toBe('See <a href="/en/products/silla">this</a>, <a href="/en/blog/x">that</a> and <a href="https://example.com">out</a>');
    expect(out.blocks[1].data.link).toBe("/en/contact");
  });
});

describe("translation change detection", () => {
  const post = (blocks: unknown[]) => ({
    title: "Title", coverTitle: null, content: { blocks }, excerpt: null,
    metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null, keywords: null,
  }) as never;

  it("does not regenerate article text for image-only API updates", () => {
    const before = post([{ id: "p", type: "paragraph", data: { text: "Keep this text" } }]);
    const after = post([
      { id: "p", type: "paragraph", data: { text: "Keep this text" } },
      { type: "image", data: { file: { url: "https://media.test/new.png" }, caption: "Diagram" } },
    ]);
    expect(translatableTextChanged(before, after)).toBe(false);
  });

  it("still regenerates translations when actual article text changes", () => {
    const before = post([{ id: "p", type: "paragraph", data: { text: "Old text" } }]);
    const after = post([{ id: "p", type: "paragraph", data: { text: "New text" } }]);
    expect(translatableTextChanged(before, after)).toBe(true);
  });
});

describe("translatePostSchema", () => {
  it("accepts paths as an object or as a JSON string", async () => {
    const { translatePostSchema } = await import("@/lib/integrations/schemas");
    const paths = { en: { "/es/": "/en/" } };
    expect(translatePostSchema.parse({ id: "p", languages: ["en"], paths }).paths).toEqual(paths);
    expect(translatePostSchema.parse({ id: "p", languages: ["en"], paths: JSON.stringify(paths) }).paths).toEqual(paths);
    expect(() => translatePostSchema.parse({ id: "p", languages: ["en"], paths: "not json" })).toThrow();
  });
});
