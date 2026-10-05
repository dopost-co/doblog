import { normalizeKeyword, type ArticleDraft } from "./content";

/** Most internal links an article keeps; Google has no magic number, readability does. */
export const MAX_INTERNAL_LINKS = 4;
/** Link targets offered to the model: enough to choose from, small enough for its context. */
export const MAX_LINK_CANDIDATES = 6;

export type LinkTarget = {
  id: string;
  title: string;
  href: string;
  summary: string;
  cluster: string | null;
  keyword: string | null;
};

type Topic = { keyword: string; secondaryKeywords?: readonly string[]; cluster?: string | null };

/** Common words that say nothing about a topic, in the languages blogs are most often written in. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "are", "how", "what", "why", "when", "from", "that", "this", "into", "about", "best", "guide",
  "los", "las", "del", "con", "por", "para", "como", "que", "una", "uno", "sus", "mas", "guia", "mejor", "mejores",
  "les", "des", "une", "pour", "avec", "dans", "sur", "der", "die", "das", "und", "mit", "fur", "ein", "eine",
  "gli", "per", "con", "della", "delle", "uma", "com", "dos", "das", "nas", "nos",
]);
const words = (value: string) => new Set(normalizeKeyword(value).split(" ").filter((word) => word.length > 2 && !STOPWORDS.has(word)));

/**
 * An article path as stored: "/es/blog" (no trailing slash, "" for the site
 * root) or a full https URL for sites that serve a language on its own host.
 */
export function normalizeArticlePath(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Use a public https URL without credentials, query or fragment");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
  if (!trimmed.startsWith("/")) throw new Error("Start the article path with / or https://");
  const path = trimmed.split("/").filter(Boolean).join("/");
  return path ? `/${path}` : "";
}

/** The article path for a language: its own one if set, otherwise the blog's default. */
export function articlePrefixFor(settings: { articleUrlPrefix?: string | null; articlePaths?: unknown } | null | undefined, language: string) {
  const paths = settings?.articlePaths && typeof settings.articlePaths === "object" ? settings.articlePaths as Record<string, unknown> : {};
  // Only set languages are stored; "" is an explicit site-root path.
  const own = paths[language];
  return typeof own === "string" ? own : settings?.articleUrlPrefix ?? "/blog";
}

/** The public URL of an article: its canonical URL, or the article path plus slug. */
export function articleHref(articleUrlPrefix: string, slug: string, canonicalUrl?: string | null) {
  if (canonicalUrl) return canonicalUrl;
  let prefix: string;
  try { prefix = normalizeArticlePath(articleUrlPrefix); } catch { prefix = "/blog"; }
  return `${prefix}/${slug}`;
}

/**
 * Orders published articles by how related they are to a topic: words shared
 * with its keywords (in the title count most), plus a strong boost for
 * articles in the same topic cluster. `keepUnrelated` keeps zero-score
 * candidates (after the related ones) when the caller already knows they fit.
 */
export function rankLinkTargets(topic: Topic, candidates: readonly LinkTarget[], limit = MAX_LINK_CANDIDATES, { keepUnrelated = false } = {}) {
  const main = words(topic.keyword);
  const secondary = words((topic.secondaryKeywords ?? []).join(" "));
  const cluster = topic.cluster ? normalizeKeyword(topic.cluster) : "";
  return candidates.map((candidate) => {
    const title = words(candidate.title);
    const context = words(`${candidate.summary} ${candidate.keyword ?? ""}`);
    let score = cluster && candidate.cluster && normalizeKeyword(candidate.cluster) === cluster ? 5 : 0;
    for (const word of main) score += title.has(word) ? 3 : context.has(word) ? 1 : 0;
    for (const word of secondary) if (title.has(word) || context.has(word)) score += 1;
    return { candidate, score };
  }).filter((item) => keepUnrelated || item.score > 0)
    // Stable for equal scores, so callers' order (e.g. most recent first) is kept.
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.candidate);
}

/** Every http(s) URL mentioned in some data, e.g. the search research given to the model. */
export function urlsIn(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return new Set((text.match(/https?:\/\/[^\s"'<>\\]+/g) ?? []).map(normalizeUrl));
}

function normalizeUrl(url: string) {
  return url.trim().replace(/[#?].*$/, "").replace(/\/+$/, "");
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const hrefOf = (attributes: string) => /href\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2]?.trim() ?? "";

function isInternal(href: string, siteHosts: ReadonlySet<string>) {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try { return siteHosts.has(new URL(href).host.replace(/^www\./, "")); } catch { return false; }
}

/** An internal address reduced for matching: the path alone on the blog's own site, without query, fragment, trailing slash or case. */
function internalKey(href: string, siteHosts: ReadonlySet<string>) {
  let path = href;
  try {
    const url = new URL(href);
    if (siteHosts.has(url.host.replace(/^www\./, ""))) path = url.pathname;
  } catch { /* Already a path. */ }
  return normalizeUrl(path).toLowerCase();
}

const lastSegment = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/**
 * Finds which offered article a model-written internal address means. Models
 * often write the full URL, add a trailing slash or drop a language prefix
 * ("/blog/slug" for "/es/blog/slug"); those still mean the offered article.
 */
function internalResolver(internal: ReadonlySet<string>, siteHosts: ReadonlySet<string>) {
  const byKey = new Map<string, string>();
  const bySlug = new Map<string, string | null>();
  for (const href of internal) {
    const key = internalKey(href, siteHosts);
    byKey.set(key, href);
    const slug = lastSegment(key);
    // An ambiguous slug matches nothing.
    if (slug) bySlug.set(slug, bySlug.has(slug) && bySlug.get(slug) !== href ? null : href);
  }
  return (href: string) => {
    const key = internalKey(href, siteHosts);
    return byKey.get(key) ?? bySlug.get(lastSegment(key)) ?? null;
  };
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Keeps only links the model was allowed to use: internal links to the offered
 * articles (each once, up to MAX_INTERNAL_LINKS, written with the offered
 * address) and external links from the research. Anything else keeps its text
 * and loses the link. Headings and FAQ questions never carry links.
 */
export function enforceArticleLinks(article: ArticleDraft, allowed: {
  internal: ReadonlySet<string>;
  external: ReadonlySet<string>;
  siteHosts: ReadonlySet<string>;
}): ArticleDraft {
  const used = new Set<string>();
  const resolve = internalResolver(allowed.internal, allowed.siteHosts);
  const unlink = (value: string) => value.replace(ANCHOR, "$2");
  const filter = (value: string) => value.replace(ANCHOR, (anchor, attributes: string, text: string) => {
    const href = hrefOf(attributes);
    if (!href) return text;
    if (isInternal(href, allowed.siteHosts)) {
      const target = resolve(href);
      if (!target || used.has(target) || used.size >= MAX_INTERNAL_LINKS) return text;
      used.add(target);
      return `<a${attributes.replace(/href\s*=\s*(["'])(.*?)\1/i, `href="${escapeAttribute(target)}"`)}>${text}</a>`;
    }
    return allowed.external.has(normalizeUrl(href)) ? anchor : text;
  });
  return {
    ...article,
    introduction: article.introduction.map(filter),
    sections: article.sections.map((section) => ({
      ...section,
      heading: unlink(section.heading),
      paragraphs: section.paragraphs.map(filter),
      bullets: section.bullets.map(filter),
    })),
    faqs: article.faqs.map((faq) => ({ question: unlink(faq.question), answer: filter(faq.answer) })),
    conclusion: article.conclusion.map(filter),
  };
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Links the first mention of one of `phrases` in a paragraph's HTML, outside
 * existing links and tags, keeping the original wording. Returns null when the
 * paragraph has no mention or already links to `href`.
 */
export function linkFirstMention(html: string, phrases: readonly string[], href: string) {
  const attribute = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (html.includes(`href="${href}"`) || html.includes(`href="${attribute}"`)) return null;
  // Tags and existing links are left untouched; only plain text between them is searched.
  const parts = html.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/gi);
  for (const phrase of phrases) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, "iu");
    for (let index = 0; index < parts.length; index += 2) {
      const match = pattern.exec(parts[index]);
      if (!match) continue;
      const text = parts[index];
      parts[index] = `${text.slice(0, match.index)}<a href="${attribute}">${match[0]}</a>${text.slice(match.index + match[0].length)}`;
      return parts.join("");
    }
  }
  return null;
}

/** Phrases worth linking for an article: its keywords, longest first, at least two words. */
export function linkPhrases(keywords: readonly string[]) {
  const seen = new Set<string>();
  return keywords.map((phrase) => phrase.replace(/\s+/g, " ").trim())
    .filter((phrase) => {
      const key = phrase.toLowerCase();
      if (phrase.split(" ").length < 2 || phrase.length < 8 || phrase.length > 80 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

/** Editor.js fields that hold inline HTML (paragraphs, headings, list items, quotes, captions). */
const HTML_FIELDS = new Set(["text", "content", "caption"]);

function mapHtmlStrings(content: unknown, transform: (html: string) => string): unknown {
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") return key && HTML_FIELDS.has(key) ? transform(value) : value;
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, walk(child, childKey)]));
    }
    return value;
  };
  return walk(content);
}

/** Every link address in an Editor.js document. */
export function linkHrefsIn(content: unknown) {
  const hrefs = new Set<string>();
  mapHtmlStrings(content, (html) => {
    for (const match of html.matchAll(ANCHOR)) {
      const href = hrefOf(match[1]);
      if (href) hrefs.add(href);
    }
    return html;
  });
  return hrefs;
}

/**
 * Rewrites links in an Editor.js document: a string in `replacements` becomes
 * the new address, null removes the link (keeping its text), and links not in
 * the map stay as they are.
 */
export function rewriteContentLinks<T>(content: T, replacements: ReadonlyMap<string, string | null>): T {
  if (!replacements.size) return content;
  return mapHtmlStrings(content, (html) => html.replace(ANCHOR, (anchor, attributes: string, text: string) => {
    const href = hrefOf(attributes);
    if (!replacements.has(href)) return anchor;
    const next = replacements.get(href);
    if (next === null || next === undefined) return text;
    const escaped = next.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a${attributes.replace(/href\s*=\s*(["'])(.*?)\1/i, `href="${escaped}"`)}>${text}</a>`;
  })) as T;
}
