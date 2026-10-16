import { MAX_INLINE_IMAGES } from "@/lib/autopilot/image-sizes";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

export const articleDraftSchema = z.object({
  title: z.string().min(8).max(180),
  /** Drawn on the brand thumbnail; see lib/autopilot/cover-title.ts. */
  coverTitle: z.string().min(3).max(60),
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
  }).strict()).max(MAX_INLINE_IMAGES),
}).strict();

export type ArticleDraft = z.infer<typeof articleDraftSchema>;

/**
 * Brings a stale freshness year ("best tools in 2024") up to the current one.
 * Only the last few years are touched, as older ones are more likely history
 * than a dated "this year"; meant for titles and metadata, not body text.
 */
export function refreshStaleYears(value: string, now = new Date()) {
  const current = now.getUTCFullYear();
  return value.replace(/(?<!\d)(20\d\d)(?!\d)/g, (year) => {
    const age = current - Number(year);
    return age >= 1 && age <= 3 ? String(current) : year;
  });
}

/**
 * Drops recent years from a slug: an article refreshed next year keeps its URL,
 * and a year in the address cannot go stale. Older years are left as history.
 */
export function slugWithoutYears(value: string, now = new Date()) {
  const current = now.getUTCFullYear();
  return value
    .replace(/(?<![\p{L}\p{N}])(20\d\d)(?![\p{L}\p{N}])/gu, (year) => Math.abs(current - Number(year)) <= 5 ? "" : year)
    .replace(/[-_\s]{2,}/g, "-").replace(/^[-_\s]+|[-_\s]+$/g, "");
}

/**
 * States the date in the prompt itself: models default to the year their training
 * data ends, and a date buried in the input JSON is easy for them to overlook.
 */
export function currentDateNote(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  return `Today is ${today}, so the current year is ${year}. Your training data is older than that: never treat an earlier year as the present, and whenever text names the current year ("best tools in ${year}", "in ${year}, ..."), write ${year}.`;
}

/** An article draft whose title, headings, image texts and metadata never present a past year as current. */
export function refreshArticleYears(article: ArticleDraft, now = new Date()): ArticleDraft {
  const refresh = (value: string) => refreshStaleYears(value, now);
  return {
    ...article,
    title: refresh(article.title), coverTitle: refresh(article.coverTitle), suggestedSlug: refresh(article.suggestedSlug),
    excerpt: refresh(article.excerpt), metaTitle: refresh(article.metaTitle), metaDescription: refresh(article.metaDescription),
    sections: article.sections.map((section) => ({ ...section, heading: refresh(section.heading) })),
    faqs: article.faqs.map((faq) => ({ ...faq, question: refresh(faq.question) })),
    conclusionHeading: refresh(article.conclusionHeading),
    coverImage: { ...article.coverImage, alt: refresh(article.coverImage.alt) },
    inlineImages: article.inlineImages.map((image) => ({
      ...image, afterHeading: refresh(image.afterHeading), alt: refresh(image.alt), caption: refresh(image.caption),
    })),
  };
}


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



export function safeInlineHtml(value: string) {
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

/**
 * Which section each image goes after: the one it names, otherwise a free
 * section spread through the article, so a heading the model reworded never
 * leaves an image out.
 */
export function placeInlineImages<T extends { afterHeading: string }>(headings: string[], images: T[]) {
  const placed = new Map<number, T[]>();
  if (!headings.length) return placed;
  const used = new Set<number>();
  const unmatched: T[] = [];
  for (const image of images) {
    const index = headings.findIndex((heading, i) => !used.has(i) && normalizeKeyword(heading) === normalizeKeyword(image.afterHeading));
    if (index === -1) { unmatched.push(image); continue; }
    used.add(index);
    placed.set(index, [...placed.get(index) ?? [], image]);
  }
  unmatched.forEach((image, order) => {
    const free = headings.map((_, i) => i).filter(i => !used.has(i));
    const pool = free.length ? free : headings.map((_, i) => i);
    // Evenly spaced through the remaining sections.
    const index = pool[Math.min(pool.length - 1, Math.floor(((order + 1) * pool.length) / (unmatched.length + 1)))];
    used.add(index);
    placed.set(index, [...placed.get(index) ?? [], image]);
  });
  return placed;
}

export function buildEditorContent(article: ArticleDraft, images: GeneratedInlineImage[] = []) {
  const placed = placeInlineImages(article.sections.map(section => section.heading), images);
  const blocks: Array<{ type: string; data: Record<string, unknown> }> = [];
  for (const paragraph of article.introduction) blocks.push({ type: "paragraph", data: { text: safeInlineHtml(paragraph) } });
  for (const [index, section] of article.sections.entries()) {
    blocks.push({ type: "header", data: { text: safeInlineHtml(section.heading), level: section.level } });
    for (const paragraph of section.paragraphs) blocks.push({ type: "paragraph", data: { text: safeInlineHtml(paragraph) } });
    if (section.bullets.length) blocks.push({
      type: "list",
      data: { style: "unordered", meta: {}, items: section.bullets.map(content => ({ content: safeInlineHtml(content), meta: {}, items: [] })) },
    });
    for (const image of placed.get(index) ?? []) {
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

type ExistingBlock = { id?: string; type: string; data: Record<string, unknown>; tunes?: Record<string, unknown> };

/**
 * Adds generated images to the document that exists now. This is used when a
 * person or API edited the draft while its images were rendering, so the
 * completed render can be attached without restoring the older text snapshot.
 */
export function mergeGeneratedInlineImages(content: unknown, images: GeneratedInlineImage[]) {
  const document = content as { time?: number; version?: string; blocks?: ExistingBlock[] } | null;
  if (!document?.blocks || !Array.isArray(document.blocks)) return content;
  const blocks = document.blocks.map(block => ({ ...block, data: { ...block.data } }));
  const existingUrls = new Set(blocks.flatMap(block => {
    const file = block.type === "image" ? block.data.file as { url?: unknown } | undefined : undefined;
    return typeof file?.url === "string" ? [file.url] : [];
  }));
  const headings = blocks.flatMap((block, index) => block.type === "header" && typeof block.data.text === "string"
    ? [{ index, level: Number(block.data.level ?? 2), text: stripHtml(block.data.text) }] : []);
  const insertions = images.filter(image => !existingUrls.has(image.url)).map((image, order) => {
    const heading = headings.find(item => normalizeKeyword(item.text) === normalizeKeyword(image.afterHeading));
    if (!heading) return { at: blocks.length, image, order };
    const next = headings.find(item => item.index > heading.index && item.level <= heading.level);
    return { at: next?.index ?? blocks.length, image, order };
  }).sort((a, b) => b.at - a.at || b.order - a.order);
  for (const { at, image } of insertions) blocks.splice(at, 0, { type: "image", data: {
    file: { url: image.url }, caption: safeInlineHtml(image.caption || image.alt), alt: image.alt,
    withBorder: false, withBackground: false, stretched: false,
  } });
  return { ...document, time: Date.now(), blocks };
}
