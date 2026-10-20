import { z } from "zod";
import { isValidLanguageCode } from "../languages";
import { API_SCOPES } from "./scopes";
import { EDITOR_CONTENT_DESCRIPTION } from "./editor-guide";

export const POST_STATUSES = ["draft", "scheduled", "published"] as const;
export type PostStatus = typeof POST_STATUSES[number];

export const idSchema = z.string().min(1).max(128);
const name = z.string().trim().min(1).max(300);
// JSON Schema patterns have no flags, and Python-based MCP clients reject
// JavaScript's Unicode property escapes during action discovery.
const slug = z.string().min(1).max(200)
  .refine(value => /^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u.test(value), "Use a URL slug without spaces or slashes")
  .describe("URL slug made of letters or numbers, optionally separated by a single hyphen or underscore. Unicode letters are supported; spaces and slashes are not.");
const text = z.string().max(10_000).nullable().optional();
const url = z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(2048)]).nullable().optional();
const ids = z.array(idSchema).max(100).refine(v => new Set(v).size === v.length, "Duplicate IDs").optional();

export const editorContentSchema = z.object({
  time: z.number().optional(),
  version: z.string().max(32).optional(),
  blocks: z.array(z.object({
    id: z.string().max(128).optional(),
    type: z.string().min(1).max(64),
    data: z.record(z.string(), z.json()),
    tunes: z.record(z.string(), z.json()).optional(),
  }).strict()).max(1000),
}).strict().describe(EDITOR_CONTENT_DESCRIPTION);

export const postCreateSchema = z.object({
  title: name, slug, content: editorContentSchema,
  language: z.string().refine(isValidLanguageCode, "Invalid language code").default("en"),
  status: z.enum(POST_STATUSES).default("draft")
    .describe("draft, published, or scheduled. A scheduled post needs a future publishedAt and goes live automatically at that time."),
  featured: z.boolean().optional(),
  excerpt: text, coverImage: url, authorId: idSchema.nullable().optional(),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional()
    .describe("ISO 8601 date-time. For status scheduled, the future instant the post is published."),
  translationGroupId: z.uuid().optional(),
  coverTitle: z.string().max(60).nullable().optional()
    .describe("Short headline drawn on the generated thumbnail, a few words. The title is drawn when this is unset."),
  metaTitle: text, metaDescription: text, ogImage: url, ogTitle: text,
  ogDescription: text, canonicalUrl: url, keywords: text,
  categoryIds: ids, tagIds: ids,
}).strict();
const nonempty = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.refine(v => Object.keys(v).length > 0, "Provide at least one field");
// Override create defaults: a PATCH must never reset language or publication state.
export const postUpdateSchema = nonempty(postCreateSchema.partial().extend({
  language: z.string().refine(isValidLanguageCode, "Invalid language code").optional(),
  status: z.enum(POST_STATUSES).optional(),
}));
const contentImage = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  alt: z.string().trim().max(240).default(""),
  caption: z.string().trim().max(300).default(""),
  /** Insert immediately after this current Editor.js block. Omit to append. */
  afterBlockId: z.string().min(1).max(128).optional(),
}).strict();
export const addPostImagesSchema = z.object({
  coverImage: url,
  /** Set this to the cover too unless an explicit social image is wanted. */
  ogImage: url,
  images: z.array(contentImage).max(20).optional(),
}).strict().refine(value => value.coverImage !== undefined || value.ogImage !== undefined || Boolean(value.images?.length), "Provide a cover, social image or at least one post image");
export const categorySchema = z.object({ name, slug, description: text }).strict();
export const tagSchema = z.object({ name, slug }).strict();
export const authorSchema = z.object({ name, slug, email: z.email().max(254), bio: text, avatar: url }).strict();
export const blogSchema = z.object({ name, slug, description: text }).strict();
export const categoryUpdateSchema = nonempty(categorySchema.partial());
export const tagUpdateSchema = nonempty(tagSchema.partial());
export const authorUpdateSchema = nonempty(authorSchema.partial());
export const blogUpdateSchema = nonempty(blogSchema.extend({
  /** Languages the blog is written in; the first is the main one (Autopilot writes in it). */
  languages: z.array(z.string().refine(isValidLanguageCode, "Invalid language code")).min(1).max(10),
  /** Keep translation groups in sync automatically (needs more than one language). */
  autoSyncTranslations: z.boolean(),
}).partial());
export const listSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
export const postListSchema = listSchema.extend({
  status: z.enum([...POST_STATUSES, "all"]).default("all"),
  publishedFrom: z.iso.datetime({ offset: true }).optional().describe("Only posts whose publishedAt is on or after this instant"),
  publishedTo: z.iso.datetime({ offset: true }).optional().describe("Only posts whose publishedAt is before this instant"),
  language: z.string().refine(isValidLanguageCode).optional(),
  categoryId: idSchema.optional(), tagId: idSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
}).strict();
export const translatePostSchema = z.object({
  id: idSchema,
  languages: z.array(z.string().refine(isValidLanguageCode, "Invalid language code")).min(1).max(10)
    .refine(v => new Set(v).size === v.length, "Duplicate languages")
    .describe("ISO 639-1 codes to translate into, e.g. [\"en\", \"it\"]"),
  // Some MCP clients send nested objects as JSON strings; accept both.
  paths: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }, z.record(
    z.string().refine(isValidLanguageCode, "Invalid language code"),
    z.record(z.string().regex(/^\//, "Must be a path starting with /").max(300), z.string().max(2048)).refine(v => Object.keys(v).length <= 50, "At most 50 rewrites per language"),
  )).optional()
    .describe("Optional per-language link prefix rewrites for the translated content, so links point to localized pages. Example: {\"en\": {\"/es/productos\": \"/en/products\", \"/es/blog/\": \"/en/blog/\"}}. The longest matching prefix wins; other links stay unchanged."),
}).strict();
export const createKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length)
    .refine(v => new Set(v).size === v.length, "Duplicate scopes"),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  neverExpires: z.boolean().default(false),
}).strict();

export const imageUploadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]),
  base64: z.string().min(4).max(956_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Expected standard padded base64, without a data URL prefix"),
  /** "logo" and "style_reference" store a brand asset for Autopilot images (needs seo:write). */
  purpose: z.enum(["content", "logo", "style_reference"]).default("content"),
}).strict();
