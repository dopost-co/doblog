import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { LOGO_POSITIONS } from "@/lib/autopilot/logo";
import { THUMBNAIL_FORMATS, coverTypography, thumbnailColors, type ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { resolveBlogOpenAiKey } from "@/src/server/services/providers/credentials";
import { loadLogo, loadStyleReferences, normalizeLogoUrl, normalizeStyleReferences } from "./image-references";
import { resolveCoverTitle } from "./cover-title";
import { makeCover, makeInlineImage } from "./images";

export const imagePreviewSchema = z.object({
  kind: z.enum(["cover", "inline"]),
  postId: z.string().min(1).max(128),
  format: z.enum(THUMBNAIL_FORMATS.map((format) => format.id) as [ThumbnailFormat, ...ThumbnailFormat[]]).default("generated"),
  colors: z.array(z.string()).max(3).default([]),
  typography: z.record(z.string(), z.unknown()).default({}),
  style: z.string().trim().max(1000).nullable().default(null),
  referenceUrls: z.array(z.string().max(2048)).max(2).default([]),
  logoUrl: z.string().max(2048).nullable().default(null),
  logoPosition: z.enum(["none", ...LOGO_POSITIONS]).default("none"),
}).strict();

const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** What to draw, from an existing article: its topic for a cover, its first section for an inline image. */
function subject(kind: "cover" | "inline", post: { title: string; excerpt: string | null; content: unknown }) {
  const blocks = ((post.content as { blocks?: Array<{ type?: string; data?: { text?: unknown } }> } | null)?.blocks ?? []);
  if (kind === "cover") return `Cover image for an article titled "${post.title}". ${plain(post.excerpt ?? "")}`.slice(0, 900);
  const headingIndex = blocks.findIndex((block) => block.type === "header" && typeof block.data?.text === "string");
  const heading = headingIndex >= 0 ? plain(String(blocks[headingIndex].data!.text)) : post.title;
  const paragraph = blocks.slice(headingIndex + 1).find((block) => block.type === "paragraph" && typeof block.data?.text === "string");
  return `Explanatory image for the section "${heading}" of an article titled "${post.title}". ${plain(String(paragraph?.data?.text ?? post.excerpt ?? ""))}`.slice(0, 900);
}

/**
 * Makes one sample image with the given (possibly unsaved) settings and an
 * existing article, exactly as generation would, and returns it without
 * storing anything. Callers check the owner first.
 */
export async function previewImage(blogId: string, raw: unknown) {
  const input = imagePreviewSchema.parse(raw);
  const post = await prisma.post.findFirst({
    where: { id: input.postId, blogId },
    select: { title: true, coverTitle: true, excerpt: true, content: true, blog: { select: { name: true } } },
  });
  if (!post) throw new ApiError(404, "Article not found");

  const needsAi = input.kind === "inline" || input.format !== "template";
  const openai = needsAi ? new OpenAI({ apiKey: await resolveBlogOpenAiKey(blogId), timeout: 120_000, maxRetries: 1 }) : null;
  const [references, logo] = await Promise.all([
    needsAi ? loadStyleReferences(blogId, normalizeStyleReferences(blogId, input.referenceUrls)) : [],
    input.logoPosition === "none" ? null : loadLogo(blogId, normalizeLogoUrl(blogId, input.logoUrl)),
  ]);
  const request = {
    prompt: subject(input.kind, post), style: input.style, references, runId: "preview",
    logo: logo ? { bytes: logo, position: input.logoPosition } : null,
  };
  const warnings: string[] = [];
  /**
   * The preview stores nothing, so an article with no headline gets one written
   * for this sample only; generation writes and keeps its own. A plain brand
   * card stays entirely AI-free, so there it falls back to the article title.
   */
  const cover = input.kind === "cover" ? await resolveCoverTitle(openai, post) : null;
  const image = input.kind === "cover"
    ? await makeCover(openai, { ...request, format: input.format, colors: thumbnailColors(input.colors), typography: coverTypography(input.typography), title: cover!.title, blogName: post.blog.name, warnings })
    : await makeInlineImage(openai!, request);
  return { image: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`, warnings };
}
