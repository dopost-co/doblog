import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory Prisma: enough of `where` (equals, in, not) for these services. */
type Row = Record<string, unknown>;
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, condition]) => {
  const value = row[key];
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const c = condition as { in?: unknown[]; not?: unknown };
    if ("in" in c && !c.in!.includes(value)) return false;
    if ("not" in c && value === c.not) return false;
    return true;
  }
  return value === condition;
});
const table = (rows: Row[]) => ({
  findMany: vi.fn(async ({ where }: { where?: Row } = {}) => rows.filter((row) => matches(row, where))
    .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))),
  findFirst: vi.fn(async ({ where }: { where?: Row } = {}) => rows.find((row) => matches(row, where)) ?? null),
  findUnique: vi.fn(async ({ where }: { where?: Row } = {}) => rows.find((row) => matches(row, where)) ?? null),
  create: vi.fn(async ({ data }: { data: Row }) => { rows.push({ ...data, createdAt: Date.now() }); return data; }),
  update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(rows.find((row) => matches(row, where))!, data)),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = rows.filter((row) => matches(row, where));
    hit.forEach((row) => Object.assign(row, data));
    return { count: hit.length };
  }),
});

const state = vi.hoisted(() => ({ posts: [] as Record<string, unknown>[], assets: [] as Record<string, unknown>[], format: "generated", uploads: 0 }));
const db = vi.hoisted(() => ({} as Record<string, unknown>));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/services/usage/openai", () => ({ blogOpenAI: vi.fn(async () => ({})) }));
vi.mock("@/src/server/services/media/upload", () => ({
  uploadBlogImage: vi.fn(async () => ({ url: `https://media.test/cover-${++state.uploads}.png`, mimeType: "image/png", size: 1 })),
}));
vi.mock("@/src/server/services/growth/image-references", () => ({
  LOGO_MISSING: "logo missing",
  loadLogo: vi.fn(async () => null),
  loadStyleReferences: vi.fn(async () => []),
  uploadCoverIllustration: vi.fn(async () => "https://media.test/illustrations/art.jpg"),
  loadCoverIllustration: vi.fn(async (_blogId: string, url: string | null) => url ? { bytes: Buffer.from("art"), mimeType: "image/jpeg" } : null),
}));
const makeCover = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/services/growth/images", () => ({ makeCover }));

const { COVER_REFRESH_LIMIT, localizeGroupCovers, refreshPostCover, refreshableCoverPostIds } = await import("@/src/server/services/growth/cover-refresh");

let created = 0;
const post = (id: string, fields: Row = {}) => ({
  id, blogId: "blog-1", title: `Title ${id}`, coverTitle: null, excerpt: null, content: null,
  coverImage: null, translationGroupId: null, language: "en", createdAt: 1000 - ++created, ...fields,
});
const asset = (postId: string, url: string, fields: Row = {}) => ({ blogId: "blog-1", postId, url, kind: "cover", origin: "generated", illustrationUrl: null, ...fields });

beforeEach(() => {
  created = 0;
  state.posts = [];
  state.assets = [];
  state.uploads = 0;
  state.format = "generated";
  Object.assign(db, {
    post: table(state.posts), mediaAsset: table(state.assets),
    blogSeoSettings: { findUnique: vi.fn(async () => ({ thumbnailFormat: state.format, thumbnailLogoPosition: "none" })) },
  });
  makeCover.mockReset().mockImplementation(async (_openai: unknown, request: { format: string; title: string; illustration?: unknown }) => ({
    bytes: Buffer.from(request.title), mimeType: "image/png", origin: request.format === "generated" ? "generated" : "template",
    prompt: null, model: null,
    illustration: request.format === "template_illustration" ? request.illustration ?? { bytes: Buffer.from("art"), mimeType: "image/jpeg", prompt: "p" } : null,
  }));
});

describe("choosing which covers to redraw", () => {
  it("redraws the covers this blog generated, newest first", async () => {
    state.posts.push(post("p1", { coverImage: "a.png" }), post("p2", { coverImage: "b.png" }));
    state.assets.push(asset("p1", "a.png"), asset("p2", "b.png"));
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p1", "p2"]);
  });

  it("counts a translation's copied cover as generated, not as set by hand", async () => {
    // Autopilot drew the English cover; the Spanish translation copied its URL.
    state.posts.push(post("en", { coverImage: "a.png", translationGroupId: "g" }), post("es", { coverImage: "a.png", translationGroupId: "g", language: "es" }));
    state.assets.push(asset("en", "a.png"));
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["en"]);
  });

  it("queues each article once, whatever its number of languages", async () => {
    state.posts.push(post("es", { coverImage: "a.png", translationGroupId: "g" }), post("en", { coverImage: "a.png", translationGroupId: "g" }), post("p3", { coverImage: "c.png" }));
    state.assets.push(asset("en", "a.png"), asset("p3", "c.png"));
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["es", "p3"]);
  });

  it("leaves hand-set covers alone unless asked for them", async () => {
    state.posts.push(post("p1", { coverImage: "a.png" }), post("p5", { coverImage: "https://elsewhere.test/x.png" }));
    state.assets.push(asset("p1", "a.png"));
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p1"]);
    expect(await refreshableCoverPostIds("blog-1", { includeManual: true })).toEqual(["p1", "p5"]);
  });

  it("leaves articles without a cover alone unless asked for them", async () => {
    state.posts.push(post("p1", { coverImage: "a.png" }), post("p9"));
    state.assets.push(asset("p1", "a.png"));
    expect(await refreshableCoverPostIds("blog-1")).toEqual(["p1"]);
    expect(await refreshableCoverPostIds("blog-1", { includeMissing: true })).toEqual(["p1", "p9"]);
  });

  it("caps one pass so a large blog is not redrawn in a single bill", async () => {
    for (let i = 0; i < COVER_REFRESH_LIMIT + 5; i += 1) {
      state.posts.push(post(`p${i}`, { coverImage: `${i}.png` }));
      state.assets.push(asset(`p${i}`, `${i}.png`));
    }
    expect((await refreshableCoverPostIds("blog-1")).length).toBe(COVER_REFRESH_LIMIT);
    expect((await refreshableCoverPostIds("blog-1", { limit: 10 })).length).toBe(10);
  });
});

describe("one cover per article across languages", () => {
  it("gives every language the same AI image", async () => {
    state.posts.push(post("en", { coverImage: "a.png", translationGroupId: "g" }), post("es", { coverImage: "a.png", translationGroupId: "g", language: "es" }));
    state.assets.push(asset("en", "a.png"));
    const result = await refreshPostCover("blog-1", "en");
    expect(makeCover).toHaveBeenCalledTimes(1);
    expect(state.posts.map((row) => row.coverImage)).toEqual([result.url, result.url]);
  });

  it("draws a brand card per language over one shared illustration", async () => {
    state.format = "template_illustration";
    state.posts.push(
      post("en", { coverImage: "a.png", translationGroupId: "g", coverTitle: "Planning content" }),
      post("es", { coverImage: "a.png", translationGroupId: "g", language: "es", coverTitle: "Planificar contenido" }),
    );
    state.assets.push(asset("en", "a.png", { origin: "template" }));
    await refreshPostCover("blog-1", "en");
    expect(makeCover).toHaveBeenCalledTimes(2);
    const [first, second] = makeCover.mock.calls.map((call) => call[1]);
    expect([first.title, second.title]).toEqual(["Planning content", "Planificar contenido"]);
    expect(first.illustration).toBeUndefined();
    expect(second.illustration).toEqual(expect.objectContaining({ prompt: "p" }));
    const [en, es] = state.posts;
    expect(en.coverImage).not.toBe(es.coverImage);
  });

  it("keeps a translation's hand-set cover unless asked to replace it", async () => {
    state.posts.push(post("en", { coverImage: "a.png", translationGroupId: "g" }), post("es", { coverImage: "https://elsewhere.test/mine.png", translationGroupId: "g" }));
    state.assets.push(asset("en", "a.png"));
    await refreshPostCover("blog-1", "en");
    expect(state.posts[1].coverImage).toBe("https://elsewhere.test/mine.png");
    await refreshPostCover("blog-1", "en", { includeManual: true });
    expect(state.posts[1].coverImage).toBe(state.posts[0].coverImage);
  });
});

describe("brand cards for new translations", () => {
  it("redraws a copied card with the translation's headline and the same art, without AI", async () => {
    state.posts.push(
      post("en", { coverImage: "card.png", translationGroupId: "g", coverTitle: "Planning content" }),
      post("es", { coverImage: "card.png", translationGroupId: "g", language: "es", coverTitle: "Planificar contenido" }),
    );
    state.assets.push(asset("en", "card.png", { origin: "template", illustrationUrl: "https://media.test/illustrations/art.jpg" }));
    expect(await localizeGroupCovers("blog-1", "g")).toMatchObject({ localized: 1 });
    expect(makeCover).toHaveBeenCalledTimes(1);
    expect(makeCover.mock.calls[0][0]).toBeNull();
    expect(makeCover.mock.calls[0][1]).toMatchObject({ title: "Planificar contenido", format: "template_illustration", illustration: expect.anything() });
    expect(state.posts[0].coverImage).toBe("card.png");
    expect(state.posts[1].coverImage).not.toBe("card.png");
    // Running again changes nothing: each card now belongs to its own language.
    makeCover.mockClear();
    expect(await localizeGroupCovers("blog-1", "g")).toMatchObject({ localized: 0 });
  });

  it("leaves shared AI images alone, as they carry no text", async () => {
    state.posts.push(post("en", { coverImage: "a.png", translationGroupId: "g" }), post("es", { coverImage: "a.png", translationGroupId: "g" }));
    state.assets.push(asset("en", "a.png"));
    expect(await localizeGroupCovers("blog-1", "g")).toMatchObject({ localized: 0 });
    expect(makeCover).not.toHaveBeenCalled();
  });
});
