import sanitizeHtml from "sanitize-html";
import { z } from "zod";

export const articleDraftSchema = z.object({
  title: z.string().min(8).max(180),
  suggestedSlug: z.string().min(3).max(180),
  excerpt: z.string().min(40).max(320),
  metaTitle: z.string().min(8).max(70),
  metaDescription: z.string().min(40).max(170),
  intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
  cluster: z.string().min(2).max(100),
  secondaryKeywords: z.array(z.string().min(2).max(100)).max(12),
  introduction: z.array(z.string().min(20).max(2000)).min(1).max(4),
  sections: z.array(z.object({
    heading: z.string().min(3).max(180),
    level: z.number().int().min(2).max(3),
    paragraphs: z.array(z.string().min(20).max(3000)).min(1).max(6),
    bullets: z.array(z.string().min(2).max(500)).max(12),
  }).strict()).min(3).max(12),
  faqHeading: z.string().min(2).max(100),
  faqs: z.array(z.object({
    question: z.string().min(5).max(220),
    answer: z.string().min(20).max(1800),
  }).strict()).max(8),
  conclusionHeading: z.string().min(2).max(120),
  conclusion: z.array(z.string().min(20).max(2000)).min(1).max(3),
  coverImage: z.object({
    prompt: z.string().min(20).max(1800),
    alt: z.string().min(3).max(240),
  }).strict(),
  inlineImages: z.array(z.object({
    afterHeading: z.string().min(3).max(180),
    prompt: z.string().min(20).max(1800),
    alt: z.string().min(3).max(240),
    caption: z.string().max(300),
  }).strict()).max(2),
}).strict();

export type ArticleDraft = z.infer<typeof articleDraftSchema>;

export type InternalLinkCandidate = {
  id: string;
  title: string;
  href: string;
  summary: string;
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function normalizeKeyword(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function contentText(content: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, key?: string) => {
    if (typeof value === "string") {
      if (["text", "content", "caption", "code"].includes(key || "")) parts.push(stripHtml(value));
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => walk(item, key));
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) walk(child, childKey);
    }
  };
  walk(content);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const tokens = (value: string) => new Set(normalizeKeyword(value).split(" ").filter(token => token.length > 2));

export function rankInternalLinks(keyword: string, posts: InternalLinkCandidate[], limit = 6) {
  const target = tokens(keyword);
  return posts.map(post => {
    const haystack = tokens(`${post.title} ${post.summary}`);
    let score = 0;
    for (const token of target) if (haystack.has(token)) score += post.title.toLowerCase().includes(token) ? 3 : 1;
    return { ...post, score };
  }).filter(post => post.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit)
    .map(post => ({ id: post.id, title: post.title, href: post.href, summary: post.summary }));
}

function safeInlineHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["a", "strong", "em", "code", "br"],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({ tagName: "a", attribs: { ...attribs, rel: "noopener" } }),
    },
  }).trim();
}

export type GeneratedInlineImage = { afterHeading: string; url: string; alt: string; caption: string };

export function buildEditorContent(article: ArticleDraft, images: GeneratedInlineImage[] = []) {
  const blocks: Array<{ type: string; data: Record<string, unknown> }> = [];
  for (const paragraph of article.introduction) blocks.push({ type: "paragraph", data: { text: safeInlineHtml(paragraph) } });
  for (const section of article.sections) {
    blocks.push({ type: "header", data: { text: safeInlineHtml(section.heading), level: section.level } });
    for (const paragraph of section.paragraphs) blocks.push({ type: "paragraph", data: { text: safeInlineHtml(paragraph) } });
    if (section.bullets.length) blocks.push({
      type: "list",
      data: { style: "unordered", meta: {}, items: section.bullets.map(content => ({ content: safeInlineHtml(content), meta: {}, items: [] })) },
    });
    for (const image of images.filter(item => normalizeKeyword(item.afterHeading) === normalizeKeyword(section.heading))) {
      blocks.push({ type: "image", data: {
        file: { url: image.url }, caption: safeInlineHtml(image.caption || image.alt), alt: image.alt,
        withBorder: false, withBackground: false, stretched: false,
      } });
    }
  }
  if (article.faqs.length) {
    blocks.push({ type: "header", data: { text: safeInlineHtml(article.faqHeading), level: 2 } });
    for (const faq of article.faqs) {
      blocks.push({ type: "header", data: { text: safeInlineHtml(faq.question), level: 3 } });
      blocks.push({ type: "paragraph", data: { text: safeInlineHtml(faq.answer) } });
    }
  }
  blocks.push({ type: "header", data: { text: safeInlineHtml(article.conclusionHeading), level: 2 } });
  for (const paragraph of article.conclusion) blocks.push({ type: "paragraph", data: { text: safeInlineHtml(paragraph) } });
  return { time: Date.now(), blocks, version: "2.31.0" };
}
