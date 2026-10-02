import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { LOGO_POSITIONS } from "@/lib/autopilot/logo";
import { THUMBNAIL_FORMATS, coverTypography, thumbnailColors, type ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { blogOpenAI } from "@/src/server/services/usage/openai";
import { loadLogo, loadStyleReferences, normalizeLogoUrl, normalizeStyleReferences } from "./image-references";
import { resolveCoverTitle } from "./cover-title";
import { imageSubject } from "./image-subject";
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
  const openai = needsAi ? await blogOpenAI(blogId, "image_preview", { timeout: 120_000, maxRetries: 1 }) : null;
  const [references, logo] = await Promise.all([
    needsAi ? loadStyleReferences(blogId, normalizeStyleReferences(blogId, input.referenceUrls)) : [],
    input.logoPosition === "none" ? null : loadLogo(blogId, normalizeLogoUrl(blogId, input.logoUrl)),
  ]);
  const request = {
    prompt: imageSubject(input.kind, post), style: input.style, references, runId: "preview",
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
    ? await makeCover(openai, { ...request, format: input.format, colors: thumbnailColors(input.colors), typography: coverTypography(input.typography), title: cover!.title, warnings })
    : await makeInlineImage(openai!, request);
  return { image: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`, warnings };
}
