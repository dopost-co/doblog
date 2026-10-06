import { afterEach, describe, expect, it, vi } from "vitest";
import { signPayload, signedHeaders, verifySignature } from "@/lib/publishing/protocol";
import { blocksToMarkdown, frontMatter, inlineMarkdown } from "@/lib/publishing/markdown";
import { detectPlatform, fixedMethod, isDeliveryMethod } from "@/lib/publishing/platforms";
import { visibleSteps } from "@/lib/onboarding/steps";
import { articleHash, toArticle, type ArticleSource } from "@/src/server/services/publishing/article";
import { adapterFor, githubConfig, normalizeEndpoint, normalizeSiteUrl } from "@/src/server/services/publishing/adapters";
import { destinationLanguages, retryDelay } from "@/src/server/services/publishing/sync";

const post = (overrides: Partial<ArticleSource> = {}): ArticleSource => ({
  id: "p1", blogId: "b1", title: "Hello", slug: "hello", excerpt: "Short", coverImage: "https://cdn.test/cover.webp", featured: false,
  content: { blocks: [
    { type: "header", data: { text: "Intro", level: 2 } },
    { type: "paragraph", data: { text: "Some <b>bold</b> and a <a href=\"https://x.test/a\">link</a>." } },
    { type: "image", data: { file: { url: "https://cdn.test/inline.png" }, caption: "A chart" } },
  ] },
  publishedAt: new Date("2026-10-01T10:00:00Z"), createdAt: new Date("2026-09-30T10:00:00Z"), updatedAt: new Date("2026-10-01T11:00:00Z"),
  language: "en", translationGroupId: "g1",
  metaTitle: "Meta", metaDescription: "Desc", canonicalUrl: null, ogTitle: null, ogDescription: null, ogImage: null, keywords: "a, b",
  author: { name: "Ada", slug: "ada" },
  categories: [{ category: { name: "Guides", slug: "guides" } }],
  tags: [{ tag: { name: "SEO", slug: "seo" } }],
  ...overrides,
});

describe("signed deliveries", () => {
  it("verifies what it signs and rejects tampering, other keys and old timestamps", () => {
    const now = Date.UTC(2026, 9, 5, 12);
    const body = JSON.stringify({ event: "ping" });
    const headers = signedHeaders("secret", "ping", body, now);
    expect(headers["X-Zenex-Signature"]).toBe(signPayload("secret", Math.floor(now / 1000), body));
    expect(verifySignature("secret", headers["X-Zenex-Timestamp"], headers["X-Zenex-Signature"], body, now)).toBe(true);
    expect(verifySignature("secret", headers["X-Zenex-Timestamp"], headers["X-Zenex-Signature"], `${body} `, now)).toBe(false);
    expect(verifySignature("other", headers["X-Zenex-Timestamp"], headers["X-Zenex-Signature"], body, now)).toBe(false);
    expect(verifySignature("secret", headers["X-Zenex-Timestamp"], headers["X-Zenex-Signature"], body, now + 301_000)).toBe(false);
    expect(verifySignature("secret", null, headers["X-Zenex-Signature"], body, now)).toBe(false);
  });
});

describe("articles as sites receive them", () => {
  it("renders HTML, collects every image once and lists only sibling translations", () => {
    const article = toArticle(post({ ogImage: "https://cdn.test/cover.webp" }), [
      { id: "p1", language: "en", slug: "hello", translationGroupId: "g1" },
      { id: "p2", language: "es", slug: "hola", translationGroupId: "g1" },
      { id: "p3", language: "fr", slug: "salut", translationGroupId: "other" },
    ]);
    expect(article.html).toContain("<h2");
    expect(article.images).toEqual(["https://cdn.test/cover.webp", "https://cdn.test/inline.png"]);
    expect(article.translations).toEqual([{ id: "p2", language: "es", slug: "hola" }]);
    expect(article.categories).toEqual([{ name: "Guides", slug: "guides" }]);
    expect(article.publishedAt).toBe("2026-10-01T10:00:00.000Z");
  });

  it("hashes what changes the copy, not the save time", () => {
    const base = toArticle(post());
    expect(articleHash({ ...base, updatedAt: "2030-01-01T00:00:00.000Z" }, "v")).toBe(articleHash(base, "v"));
    expect(articleHash({ ...base, title: "Other" }, "v")).not.toBe(articleHash(base, "v"));
    expect(articleHash(base, "v2")).not.toBe(articleHash(base, "v"));
  });
});

describe("Markdown for repositories", () => {
  it("converts blocks and inline formatting, and maps image URLs", () => {
    const markdown = blocksToMarkdown({ blocks: [
      { type: "header", data: { text: "Title <i>here</i>", level: 3 } },
      { type: "list", data: { style: "ordered", items: [{ content: "One", items: [{ content: "Nested", items: [] }] }, { content: "Two", items: [] }] } },
      { type: "table", data: { withHeadings: true, content: [["A", "B|C"], ["1", "2"]] } },
      { type: "image", data: { file: { url: "https://cdn.test/x.png" }, caption: "Cap" } },
      { type: "code", data: { code: "const a = 1;" } },
    ] }, (url) => url.replace("https://cdn.test", "/blog"));
    expect(markdown).toContain("### Title *here*");
    expect(markdown).toContain("1. One\n  1. Nested\n2. Two");
    expect(markdown).toContain("| A | B\\|C |\n| --- | --- |\n| 1 | 2 |");
    expect(markdown).toContain("![Cap](/blog/x.png)");
    expect(markdown).toContain("```\nconst a = 1;\n```");
    expect(inlineMarkdown("a&nbsp;<b>b</b> <code>c</code>")).toBe("a **b** `c`");
  });

  it("writes front matter that YAML can read back", () => {
    const article = toArticle(post({ title: "Quotes \"inside\": yes" }));
    const front = frontMatter(article, (url) => `/local/${url.split("/").pop()}`);
    expect(front).toContain('title: "Quotes \\"inside\\": yes"');
    expect(front).toContain('cover: "/local/cover.webp"');
    expect(front).toContain('categories:\n  - "Guides"');
    expect(front.startsWith("---\n") && front.endsWith("---\n")).toBe(true);
  });
});

describe("platforms", () => {
  it("detects common platforms from homepage markup", () => {
    expect(detectPlatform('<link href="/wp-content/themes/x/style.css">')).toBe("wordpress");
    expect(detectPlatform('<script>var prestashop = {"cart":{}}</script>')).toBe("prestashop");
    expect(detectPlatform('<script src="/_next/static/chunks/main.js"></script>')).toBe("nextjs");
    expect(detectPlatform('<link href="/_astro/index.css">')).toBe("astro");
    expect(detectPlatform('<meta name="generator" content="Astro v4">')).toBe("astro");
    expect(detectPlatform("<html><body>Hi</body></html>")).toBeNull();
  });

  it("gives WordPress and PrestaShop one way in and sites in code a choice", () => {
    expect(fixedMethod("wordpress")).toBe("plugin");
    expect(fixedMethod("nextjs")).toBeNull();
    expect(isDeliveryMethod("plugin", "prestashop")).toBe(true);
    expect(isDeliveryMethod("github", "prestashop")).toBe(false);
    expect(isDeliveryMethod("api", "astro")).toBe(true);
    expect(isDeliveryMethod("plugin", "astro")).toBe(false);
  });

  it("normalizes addresses and keeps webhook paths", () => {
    expect(normalizeSiteUrl("example.com/")).toBe("https://example.com");
    expect(normalizeSiteUrl("http://example.com/shop/")).toBe("http://example.com/shop");
    expect(normalizeEndpoint("example.com/api/zenex?x=1#frag")).toBe("https://example.com/api/zenex?x=1");
    expect(() => normalizeSiteUrl("https://user:pass@example.com")).toThrow();
  });
});

describe("languages a site receives", () => {
  const destination = (method: string, siteInfo: object | null, config: object = {}) => ({ method, siteInfo, config }) as never;
  it("sends only the main language to a site that holds one", () => {
    expect(destinationLanguages(destination("plugin", { multilingual: false, languages: ["en"] }), ["es", "en"])).toEqual(["es"]);
    expect(destinationLanguages(destination("plugin", { multilingual: true, languages: ["en", "fr"] }), ["es", "en", "fr"])).toEqual(["en", "fr"]);
    expect(destinationLanguages(destination("github", null), ["es", "en"])).toEqual(["es", "en"]);
    expect(destinationLanguages(destination("plugin", { multilingual: true }, { languages: ["en"] }), ["es", "en"])).toEqual(["en"]);
  });

  it("backs off retries up to once a day", () => {
    expect(retryDelay(1)).toBe(60_000);
    expect(retryDelay(3)).toBe(15 * 60_000);
    expect(retryDelay(50)).toBe(24 * 60 * 60_000);
  });
});

describe("onboarding asks where articles go", () => {
  const ids = (values: Record<string, string | string[]>) => visibleSteps("new-blog", values).map((step) => step.id);
  it("asks the platform only with a website, the method only for sites in code, and to connect when articles are copied", () => {
    expect(ids({ websiteSkipped: "true", website: "" })).not.toContain("site-platform");
    const wordpress = ids({ website: "example.com", sitePlatform: "wordpress", contentMode: "manual" });
    expect(wordpress).toContain("site-platform");
    expect(wordpress).not.toContain("site-delivery");
    expect(wordpress.at(-1)).toBe("site-connect");
    const next = ids({ website: "example.com", sitePlatform: "nextjs", deliveryMethod: "api", contentMode: "manual" });
    expect(next).toContain("site-delivery");
    expect(next).not.toContain("site-connect");
    expect(ids({ website: "example.com", sitePlatform: "astro", deliveryMethod: "github", contentMode: "manual" })).toContain("site-connect");
  });
});

describe("GitHub destination", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A tiny in-memory GitHub: one branch, trees as path maps. */
  function fakeGitHub() {
    let counter = 0;
    const id = () => `sha${++counter}`;
    const trees = new Map<string, Map<string, string>>([["tree0", new Map()]]);
    const commits = new Map<string, { tree: string; message: string }>([["c0", { tree: "tree0", message: "init" }]]);
    let head = "c0";
    const blobs = new Map<string, string>();
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    const fetch = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/repos/acme/site", "");
      const body = init.body ? JSON.parse(String(init.body)) : null;
      const method = init.method ?? "GET";
      if (path === "" && method === "GET") return json(200, { full_name: "acme/site", html_url: "https://github.com/acme/site" });
      if (path === "/branches/main") return json(200, { name: "main" });
      if (path === "/git/blobs") { const sha = id(); blobs.set(sha, body.content); return json(201, { sha }); }
      if (path === "/git/ref/heads/main") return json(200, { object: { sha: head } });
      if (path.startsWith("/git/commits/")) return json(200, { tree: { sha: commits.get(path.split("/").pop()!)!.tree } });
      if (path === "/git/trees") {
        const next = new Map(trees.get(body.base_tree));
        for (const entry of body.tree) {
          if (entry.sha === null) next.delete(entry.path);
          else next.set(entry.path, entry.content ?? `blob:${entry.sha}`);
        }
        const same = [...next].length === trees.get(body.base_tree)!.size && [...next].every(([key, value]) => trees.get(body.base_tree)!.get(key) === value);
        if (same) return json(201, { sha: body.base_tree });
        const sha = id();
        trees.set(sha, next);
        return json(201, { sha });
      }
      if (path === "/git/commits" && method === "POST") { const sha = id(); commits.set(sha, { tree: body.tree, message: body.message }); return json(201, { sha }); }
      if (path === "/git/refs/heads/main" && method === "PATCH") { head = body.sha; return json(200, {}); }
      if (path.startsWith("/contents/")) {
        const file = decodeURIComponent(path.slice("/contents/".length));
        return trees.get(commits.get(head)!.tree)!.has(file) ? json(200, { path: file }) : json(404, { message: "Not Found" });
      }
      if (url.hostname === "cdn.test") return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
      return json(404, { message: `Unhandled ${method} ${path}` });
    });
    return { fetch, files: () => trees.get(commits.get(head)!.tree)!, messages: () => [...commits.values()].map((commit) => commit.message) };
  }

  it("commits the article and its images, moves it on slug changes and removes it", async () => {
    const github = fakeGitHub();
    vi.stubGlobal("fetch", github.fetch);
    const adapter = adapterFor({
      platform: "nextjs", method: "github", siteUrl: "https://acme.test", secret: "token", multilingual: false,
      config: githubConfig({ repo: "acme/site", branch: "main" }), articleUrl: ({ slug }) => `https://acme.test/blog/${slug}`,
    });
    await adapter.check();
    const source = post();
    const first = await adapter.upsert(toArticle(source), source, null);
    expect(first).toEqual({ remoteId: "content/blog/hello.md", url: "https://acme.test/blog/hello" });
    const markdown = github.files().get("content/blog/hello.md")!;
    expect(markdown).toContain('title: "Hello"');
    expect(markdown).toMatch(/!\[A chart\]\(\/blog\/[0-9a-f]{16}\.png\)/);
    expect([...github.files().keys()].filter((path) => path.startsWith("public/blog/"))).toHaveLength(2);

    const commitsBefore = github.messages().length;
    await adapter.upsert(toArticle(source), source, first.remoteId);
    expect(github.messages()).toHaveLength(commitsBefore);

    const renamed = post({ slug: "hello-again" });
    const moved = await adapter.upsert(toArticle(renamed), renamed, first.remoteId);
    expect(moved.remoteId).toBe("content/blog/hello-again.md");
    expect(github.files().has("content/blog/hello.md")).toBe(false);

    await adapter.remove({ id: "p1", language: "en", translationGroupId: "g1" }, moved.remoteId);
    expect(github.files().has("content/blog/hello-again.md")).toBe(false);
    await adapter.remove({ id: "p1", language: "en", translationGroupId: "g1" }, moved.remoteId);
  });
});
