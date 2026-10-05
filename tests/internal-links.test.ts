import { describe, expect, it } from "vitest";
import type { ArticleDraft } from "@/src/server/services/growth/content";
import { articleHref, enforceArticleLinks, linkFirstMention, linkPhrases, rankLinkTargets, urlsIn } from "@/src/server/services/growth/internal-links";

const target = (id: string, title: string, extra: Partial<{ cluster: string; summary: string; keyword: string }> = {}) => ({
  id, title, href: `/blog/${id}`, summary: extra.summary ?? "", cluster: extra.cluster ?? null, keyword: extra.keyword ?? null,
});

describe("Choosing articles to link", () => {
  it("ranks by shared words, boosting articles from the same topic cluster", () => {
    const ranked = rankLinkTargets({ keyword: "email marketing for freelancers", cluster: "Freelance growth" }, [
      target("tips", "Email tips"),
      target("pricing", "Pricing your freelance work", { cluster: "Freelance growth" }),
      target("basics", "Email marketing basics"),
      target("bread", "Sourdough starter tips"),
    ]);
    // Two title words beat the cluster alone; the cluster beats a single shared word; unrelated is left out.
    expect(ranked.map((item) => item.id)).toEqual(["basics", "pricing", "tips"]);
  });

  it("ignores common words when judging relatedness", () => {
    expect(rankLinkTargets({ keyword: "how to price your freelance work" }, [target("x", "How to bake bread for your family")])).toEqual([]);
  });

  it("builds article paths from the blog's article prefix unless there is a canonical URL", () => {
    expect(articleHref("/blog/", "crm-guide")).toBe("/blog/crm-guide");
    expect(articleHref("/", "crm-guide")).toBe("/crm-guide");
    expect(articleHref("/blog", "crm-guide", "https://example.com/guides/crm")).toBe("https://example.com/guides/crm");
  });
});

describe("Links in generated articles", () => {
  const article = (paragraph: string, heading = "Getting started"): ArticleDraft => ({
    title: "A guide", coverTitle: "A short guide", suggestedSlug: "guide", excerpt: "x".repeat(40), metaTitle: "A guide", metaDescription: "x".repeat(40),
    intent: "informational", cluster: "Guides", secondaryKeywords: [],
    introduction: [paragraph],
    sections: [{ heading, level: 2, paragraphs: [paragraph], bullets: [] }],
    faqHeading: "FAQ", faqs: [{ question: `See <a href="/blog/a">this</a>?`, answer: paragraph }],
    conclusionHeading: "Wrap up", conclusion: [paragraph],
    coverImage: { prompt: "p".repeat(20), alt: "alt" }, inlineImages: [],
  });
  const allowed = { internal: new Set(["/blog/a", "/blog/b"]), external: urlsIn({ results: [{ url: "https://research.org/study" }] }), siteHosts: new Set(["example.com"]) };

  it("keeps offered internal links once each and research links", () => {
    const result = enforceArticleLinks(article(`Read <a href="/blog/a">the guide</a> and <a href="https://research.org/study/">the study</a>.`), allowed);
    expect(result.introduction[0]).toBe(`Read <a href="/blog/a">the guide</a> and <a href="https://research.org/study/">the study</a>.`);
    // The same article is linked only the first time.
    expect(result.sections[0].paragraphs[0]).toBe(`Read the guide and <a href="https://research.org/study/">the study</a>.`);
  });

  it("removes invented internal URLs and unknown external links, keeping their text", () => {
    const result = enforceArticleLinks(article(`See <a href="/blog/made-up">this</a>, <a href="https://example.com/nope">that</a> and <a href="https://spam.test">more</a>.`), allowed);
    expect(result.introduction[0]).toBe("See this, that and more.");
  });

  it("keeps offered articles written as full URLs, with a trailing slash or without the language prefix", () => {
    const localized = { ...allowed, internal: new Set(["/es/blog/batching", "/es/blog/timing", "/es/blog/tools"]) };
    const result = enforceArticleLinks(article(
      `See <a href="https://www.example.com/es/blog/batching/" rel="noopener">batching</a>, <a href="/blog/timing">timing</a> and <a href="/es/blog/Tools?ref=x">tools</a>.`,
    ), localized);
    expect(result.introduction[0]).toBe(`See <a href="/es/blog/batching" rel="noopener">batching</a>, <a href="/es/blog/timing">timing</a> and <a href="/es/blog/tools">tools</a>.`);
  });

  it("never keeps links in headings or FAQ questions", () => {
    const result = enforceArticleLinks(article("Plain text.", `Using <a href="/blog/a">guides</a>`), allowed);
    expect(result.sections[0].heading).toBe("Using guides");
    expect(result.faqs[0].question).toBe("See this?");
  });
});

describe("Linking existing articles to a new one", () => {
  it("links the first plain mention, keeping its wording", () => {
    expect(linkFirstMention("Choosing an <strong>Email Marketing</strong> tool? Email marketing matters.", ["email marketing"], "/blog/email"))
      .toBe(`Choosing an <strong><a href="/blog/email">Email Marketing</a></strong> tool? Email marketing matters.`);
  });

  it("ignores text inside existing links, partial words and paragraphs that already link there", () => {
    expect(linkFirstMention(`<a href="/x">email marketing</a> is hard`, ["email marketing"], "/blog/email")).toBeNull();
    expect(linkFirstMention("emailmarketing tools", ["email marketing"], "/blog/email")).toBeNull();
    expect(linkFirstMention(`Try <a href="/blog/email">it</a>. Email marketing works.`, ["email marketing"], "/blog/email")).toBeNull();
  });

  it("escapes the link address", () => {
    expect(linkFirstMention("Email marketing works.", ["email marketing"], `https://site.test/a?"x"`))
      .toBe(`<a href="https://site.test/a?&quot;x&quot;">Email marketing</a> works.`);
  });

  it("uses multi-word keywords, longest first", () => {
    expect(linkPhrases(["crm", " crm for freelancers", "best crm for small freelancers", "CRM for freelancers"])).toEqual(["best crm for small freelancers", "crm for freelancers"]);
  });
});
