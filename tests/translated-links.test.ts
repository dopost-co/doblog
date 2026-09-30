import { beforeEach, describe, expect, it, vi } from "vitest";
import { articleHref, articlePrefixFor, linkHrefsIn, normalizeArticlePath, rewriteContentLinks } from "@/src/server/services/growth/internal-links";

const db = vi.hoisted(() => ({ blogSeoSettings: { findUnique: vi.fn() }, post: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const { localizeArticleLinks, slugUnder } = await import("@/src/server/services/translations/translated-links");

describe("Article paths per language", () => {
  it("normalizes paths and full URLs, and rejects the rest", () => {
    expect(normalizeArticlePath(" /es/blog/ ")).toBe("/es/blog");
    expect(normalizeArticlePath("/")).toBe("");
    expect(normalizeArticlePath("https://es.site.com/blog/")).toBe("https://es.site.com/blog");
    expect(() => normalizeArticlePath("es/blog")).toThrow();
    expect(() => normalizeArticlePath("http://site.com/blog")).toThrow();
    expect(() => normalizeArticlePath("https://user:pass@site.com/blog")).toThrow();
  });

  it("uses a language's own path, falling back to the default", () => {
    const settings = { articleUrlPrefix: "/blog", articlePaths: { es: "/es/blog" } };
    expect(articlePrefixFor(settings, "es")).toBe("/es/blog");
    expect(articlePrefixFor(settings, "fr")).toBe("/blog");
    expect(articlePrefixFor(null, "fr")).toBe("/blog");
    expect(articlePrefixFor({ articleUrlPrefix: "/blog", articlePaths: { de: "" } }, "de")).toBe("");
    expect(articleHref("https://es.site.com/blog", "guia")).toBe("https://es.site.com/blog/guia");
    expect(articleHref("", "guide")).toBe("/guide");
  });

  it("recognizes article URLs under a path", () => {
    expect(slugUnder("/blog/guide", "/blog")).toBe("guide");
    expect(slugUnder("/blog/a/b", "/blog")).toBeNull();
    expect(slugUnder("/about", "/blog")).toBeNull();
    expect(slugUnder("https://es.site.com/blog/guia", "https://es.site.com/blog")).toBe("guia");
  });
});

describe("Rewriting links in documents", () => {
  const doc = { blocks: [
    { type: "paragraph", data: { text: `Read <a href="/blog/a" rel="noopener">A</a> and <a href="https://ext.test">B</a>.` } },
    { type: "list", data: { items: [{ content: `See <a href="/blog/b">B</a>`, items: [] }] } },
  ] };

  it("finds links in paragraphs and lists", () => {
    expect([...linkHrefsIn(doc)]).toEqual(["/blog/a", "https://ext.test", "/blog/b"]);
  });

  it("rewrites or removes mapped links and leaves the rest", () => {
    const result = rewriteContentLinks(doc, new Map([["/blog/a", "/es/blog/a"], ["/blog/b", null]]));
    expect(result.blocks[0].data.text).toBe(`Read <a href="/es/blog/a" rel="noopener">A</a> and <a href="https://ext.test">B</a>.`);
    expect(result.blocks[1].data.items![0].content).toBe("See B");
  });
});

describe("Links in translated articles", () => {
  beforeEach(() => { db.blogSeoSettings.findUnique.mockReset(); db.post.findMany.mockReset(); });
  const content = { blocks: [{ type: "paragraph", data: { text: `See <a href="/blog/pricing#tips">pricing</a>, <a href="/blog/tools">tools</a> and <a href="https://ext.test/x">this</a>.` } }] };

  it("points to published translations at the language's path and unlinks missing ones", async () => {
    db.blogSeoSettings.findUnique.mockResolvedValue({ articleUrlPrefix: "/blog", articlePaths: { es: "/es/blog" } });
    db.post.findMany
      .mockResolvedValueOnce([
        { slug: "pricing", canonicalUrl: null, translationGroupId: "g1" },
        { slug: "tools", canonicalUrl: null, translationGroupId: "g2" },
      ])
      .mockResolvedValueOnce([{ slug: "precios", canonicalUrl: null, translationGroupId: "g1" }]);
    const result = await localizeArticleLinks("blog", content, "en", "es");
    expect(result.blocks[0].data.text).toBe(`See <a href="/es/blog/precios#tips">pricing</a>, tools and <a href="https://ext.test/x">this</a>.`);
    // Only published translations in the target language count.
    expect(db.post.findMany.mock.calls[1][0].where).toMatchObject({ language: "es", status: "published", translationGroupId: { in: ["g1", "g2"] } });
  });

  it("leaves documents without links to the blog's articles untouched", async () => {
    db.blogSeoSettings.findUnique.mockResolvedValue(null);
    db.post.findMany.mockResolvedValueOnce([]);
    expect(await localizeArticleLinks("blog", content, "en", "es")).toBe(content);
  });
});
