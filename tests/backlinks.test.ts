import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  post: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  postSeoTarget: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/services/content/cache", () => ({ invalidateContent: vi.fn() }));

const { linkFromRelatedArticles } = await import("@/src/server/services/growth/backlinks");

const newPost = (backlinksEnabled = true, overrides: Record<string, unknown> = {}) => ({
  id: "new", blogId: "blog", slug: "email-marketing-guide", title: "Email marketing guide", language: "en", status: "published",
  canonicalUrl: null, translationGroupId: "group-new",
  seoTarget: { primaryKeyword: "email marketing", secondaryKeywords: [], cluster: "Marketing" },
  keywords: null as string | null,
  blog: { blogId: "public", deletedAt: null as Date | null, seoSettings: { backlinksEnabled, articleUrlPrefix: "/blog" } },
  ...overrides,
});
const paragraph = (text: string) => ({ blocks: [{ type: "header", data: { text: "Email marketing" } }, { type: "paragraph", data: { text } }] });
const updatedAt = new Date("2026-09-30T10:00:00Z");

describe("Links from existing articles to a new one", () => {
  beforeEach(() => {
    db.post.findUnique.mockReset(); db.post.findMany.mockReset(); db.post.updateMany.mockReset(); db.$queryRaw.mockReset(); db.postSeoTarget.findFirst.mockReset();
  });

  it("does nothing without a mention in any published article", async () => {
    db.post.findUnique.mockResolvedValue(newPost());
    db.$queryRaw.mockResolvedValue([]);
    expect(await linkFromRelatedArticles("new")).toEqual({ linked: [] });
    expect(db.post.updateMany).not.toHaveBeenCalled();
  });

  it("ignores posts written by hand", async () => {
    db.post.findUnique.mockResolvedValue(newPost(true, { seoTarget: null }));
    db.postSeoTarget.findFirst.mockResolvedValue(null);
    expect(await linkFromRelatedArticles("new")).toEqual({ linked: [] });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("ignores deleted blogs", async () => {
    db.post.findUnique.mockResolvedValue(newPost(true, { blog: { blogId: "public", deletedAt: new Date(), seoSettings: null } }));
    expect(await linkFromRelatedArticles("new")).toEqual({ linked: [] });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("treats translations of Autopilot articles as Autopilot articles, in their own language", async () => {
    db.post.findUnique.mockResolvedValue(newPost(true, { seoTarget: null, language: "es", keywords: "marketing por email, listas de correo" }));
    db.postSeoTarget.findFirst.mockResolvedValue({ primaryKeyword: "email marketing", secondaryKeywords: [], cluster: "Marketing" });
    db.$queryRaw.mockResolvedValue([]);
    await linkFromRelatedArticles("new");
    expect(db.$queryRaw.mock.calls[0][5]).toEqual(expect.arrayContaining(["%marketing por email%", "%listas de correo%"]));
  });

  it("links a translation from articles in its own language, at that language's path, without retranslating them", async () => {
    db.post.findUnique.mockResolvedValue(newPost(true, {
      seoTarget: null, language: "es", slug: "guia-email-marketing", keywords: "marketing por email",
      blog: { blogId: "public", deletedAt: null, seoSettings: { backlinksEnabled: true, articleUrlPrefix: "/blog", articlePaths: { es: "/es/blog" } } },
    }));
    db.postSeoTarget.findFirst.mockResolvedValue({ primaryKeyword: "email marketing", secondaryKeywords: [], cluster: "Marketing" });
    db.$queryRaw.mockResolvedValue([{ id: "old-es" }]);
    db.post.findMany
      .mockResolvedValueOnce([{ id: "old-es", title: "Boletines", slug: "boletines", excerpt: "", metaDescription: null, canonicalUrl: null, publishedAt: updatedAt, seoTarget: null }])
      .mockResolvedValueOnce([{ id: "old-es", content: paragraph("Empieza hoy con el marketing por email."), updatedAt }]);
    db.post.updateMany.mockResolvedValue({ count: 1 });

    expect(await linkFromRelatedArticles("new")).toEqual({ linked: ["old-es"] });
    // Only Spanish articles are searched; other languages get links from their own translation.
    expect(db.$queryRaw.mock.calls[0]).toContain("es");
    const { where, data } = db.post.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "old-es", updatedAt });
    expect(JSON.stringify(data.content)).toContain('href=\\"/es/blog/guia-email-marketing\\"');
    // A plain content edit: it does not queue the article for automatic retranslation.
    expect(Object.keys(data)).toEqual(["content"]);
  });

  it("does nothing when the blog turned it off", async () => {
    db.post.findUnique.mockResolvedValue(newPost(false));
    expect(await linkFromRelatedArticles("new")).toEqual({ linked: [] });
    expect(db.post.findMany).not.toHaveBeenCalled();
  });

  it("links up to three related articles at their first mention, skipping edited or already linked ones", async () => {
    db.post.findUnique.mockResolvedValue(newPost());
    // Articles are found by what their text mentions, even with unrelated titles.
    const related = ["a", "b", "c", "d", "e"].map((id) => ({ id, title: `Newsletter notes ${id}`, slug: id, excerpt: "", metaDescription: "", canonicalUrl: null, publishedAt: updatedAt, seoTarget: null }));
    db.$queryRaw.mockResolvedValue(related.map(({ id }) => ({ id })));
    db.post.findMany
      .mockResolvedValueOnce(related)
      .mockResolvedValueOnce([
        { id: "a", content: paragraph("Good email marketing takes time."), updatedAt },
        { id: "b", content: paragraph(`Already <a href="/blog/email-marketing-guide">linked</a>.`), updatedAt },
        { id: "c", content: paragraph("Email marketing for teams."), updatedAt },
        { id: "d", content: paragraph("Nothing relevant here."), updatedAt },
        { id: "e", content: paragraph("More on email marketing."), updatedAt },
      ]);
    // "c" was edited by someone meanwhile, so its guarded update matches nothing.
    db.post.updateMany.mockImplementation(async ({ where }: { where: { id: string } }) => ({ count: where.id === "c" ? 0 : 1 }));

    const result = await linkFromRelatedArticles("new");
    expect(result.linked).toEqual(["a", "e"]);
    const first = db.post.updateMany.mock.calls[0][0];
    expect(first.where).toEqual({ id: "a", updatedAt });
    expect(first.data.content.blocks[1].data.text).toBe(`Good <a href="/blog/email-marketing-guide">email marketing</a> takes time.`);
    // Headings are never linked.
    expect(first.data.content.blocks[0].data.text).toBe("Email marketing");
    // The search looks for the article's keywords, escaped for ILIKE.
    expect(db.$queryRaw.mock.calls[0][5]).toEqual(expect.arrayContaining(["%email marketing%"]));
  });

  it("uses title phrases when discovery keywords are in another language", async () => {
    db.post.findUnique.mockResolvedValue(newPost(true, {
      title: "The Best Free Video Banks for Social Media",
      keywords: "mejores bancos de videos gratis",
      seoTarget: { primaryKeyword: "mejores bancos de videos gratis", secondaryKeywords: [], cluster: "Social media" },
    }));
    db.$queryRaw.mockResolvedValue([{ id: "old" }]);
    db.post.findMany
      .mockResolvedValueOnce([{ id: "old", title: "Content ideas", slug: "ideas", excerpt: "", metaDescription: "", canonicalUrl: null, publishedAt: updatedAt, seoTarget: null }])
      .mockResolvedValueOnce([{ id: "old", content: paragraph("Use free video banks to source clips for your campaign."), updatedAt }]);
    db.post.updateMany.mockResolvedValue({ count: 1 });

    expect(await linkFromRelatedArticles("new")).toEqual({ linked: ["old"] });
    expect(JSON.stringify(db.post.updateMany.mock.calls[0][0].data.content)).toContain('href=\\"/blog/email-marketing-guide\\"');
  });
});
