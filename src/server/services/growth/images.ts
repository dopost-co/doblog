import OpenAI, { type Uploadable } from "openai";
import sharp from "sharp";
import { ApiError } from "@/lib/integrations/errors";
import { LOGO_MAX_HEIGHT, type LogoPosition } from "@/lib/autopilot/logo";
import type { CoverTypography, ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { compositionFor, modelSizeFor, type ImageSize, type ModelImageSize } from "@/lib/autopilot/image-sizes";
import { DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_QUALITY, DEFAULT_LOGO_MARGIN, DEFAULT_LOGO_WIDTH, type ImageModel, type ImageQuality } from "@/lib/autopilot/image-generation";
import { renderCoverPng } from "./cover-render";

/**
 * Makes the images of an article without storing them, so generation and
 * previews share exactly the same result. Callers store what they keep.
 */
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

export type MadeImage = {
  bytes: Buffer;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
  /** "generated" (AI image) or "template" (brand card). */
  origin: "generated" | "template";
  prompt: string | null;
  revisedPrompt?: string | null;
  /** The image model used, or null when no AI was involved. */
  model: string | null;
};

export type ImageLogo = { bytes: Buffer; position: LogoPosition; width?: number; margin?: number };
type Logo = ImageLogo | null;
/** The AI art drawn inside a brand card, kept so every language's card shares it. */
export type CoverIllustration = { bytes: Buffer; mimeType: string; prompt: string | null; revisedPrompt?: string | null };
type ImageFormat = "webp" | "png" | "jpeg";

const TRANSPARENT = /transpar(?:en|ê)|trasparen|sin fondo|sem fundo|no background|without (?:a )?background|cut-?out/i;
/** "no transparency", "sin transparencia", "avoid cutouts"…: a negation within a few words before the term. */
const NEGATED_TRANSPARENT = /\b(?:no|not|non|never|avoid|without|sin|nada de|sem|nunca)\b[^.,;:\n]{0,40}?(?:transpar\w*|trasparen\w*|cut-?outs?|alpha)/gi;
/**
 * Whether a style asks for a see-through background. Asked only in the prompt,
 * the model paints a fake checkerboard; with this the API returns real alpha.
 * Negated mentions ("no transparency, no cutout") ask for the opposite.
 */
export function wantsTransparentBackground(style: string | null | undefined) {
  if (!style) return false;
  return TRANSPARENT.test(style.replace(NEGATED_TRANSPARENT, " "));
}

/** gpt-image-2 rejects transparent backgrounds; the 1.x models and later ones accept them. */
function supportsTransparency(model: string) {
  return !/^gpt-image-2(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
}

type ImageRequest = {
  prompt: string;
  style?: string | null;
  /** Style references (see image-references.ts); empty for text-only generation. */
  references: Uploadable[];
  runId: string;
  logo?: Logo;
  /** Final size of the image; drawn at the nearest model size, then cropped to it. */
  size: ImageSize;
  /** Saved provider controls. One output is consumed per article image. */
  model?: ImageModel;
  quality?: ImageQuality;
  conceptPrompt?: string | null;
  articleTitle?: string;
  summary?: string | null;
};

/**
 * One image from the model. With style references it uses the edit endpoint,
 * which takes them as input images (up to 16 for GPT image models) and, with
 * high input fidelity, follows their style closely. If that fails, it falls
 * back to text-only generation so the image is still made.
 */
export async function requestImage(
  openai: Pick<OpenAI, "images">, prompt: string, references: Uploadable[], runId: string,
  { format = "webp", size = "1536x1024", transparent = false, model = IMAGE_MODEL, quality = DEFAULT_IMAGE_QUALITY }:
  { format?: ImageFormat; size?: ModelImageSize; transparent?: boolean; model?: string; quality?: ImageQuality } = {},
) {
  const transparentOutput = transparent && supportsTransparency(model);
  const options = {
    model, prompt, size, quality, n: 1,
    // Transparency needs a format with alpha: JPEG becomes PNG.
    output_format: transparentOutput && format === "jpeg" ? "png" : format,
    // Opaque when not asked for, so the model never decides on alpha itself (gpt-image-2 only does opaque).
    ...(transparentOutput ? { background: "transparent" as const } : supportsTransparency(IMAGE_MODEL) ? { background: "opaque" as const } : {}),
  } as const;
  if (!references.length) return openai.images.generate(options);
  try {
    return await openai.images.edit({ ...options, image: references, input_fidelity: "high" });
  } catch (error) {
    console.warn("[Growth] reference-image-failed", { runId, error: error instanceof Error ? error.message : String(error) });
    return openai.images.generate(options);
  }
}

/** Asks the image model for one illustration and returns its bytes. */
async function illustrate(openai: OpenAI, request: Omit<ImageRequest, "size">, output: { format: ImageFormat; size: ModelImageSize; shape: string }) {
  const model = request.model ?? IMAGE_MODEL;
  const transparent = wantsTransparentBackground(request.style) && supportsTransparency(model);
  const fill = (template: string) => template
    .replace(/\[TITLE\]/gi, request.articleTitle || request.prompt)
    .replace(/\[SUMMARY\]/gi, request.summary || "");
  const prompt = [
    request.conceptPrompt ? `Art-direction brief:\n${fill(request.conceptPrompt)}` : null,
    request.articleTitle ? `Article title: ${request.articleTitle}` : null,
    request.summary ? `Article summary: ${request.summary}` : null,
    request.prompt,
    request.style ? `Visual direction: ${fill(request.style)}` : "Polished editorial illustration with a restrained, modern visual language.",
    request.references.length ? "Match the visual style of the reference images: palette, rendering, texture and mood. Do not copy their subjects, text or layout." : null,
    `${output.shape} No words, letters, watermarks, brand marks or UI text.`,
    transparent ? "Leave the background fully transparent around the subject. Never draw a checkerboard or any pattern to suggest transparency." : null,
  ].filter(Boolean).join("\n");
  const format: ImageFormat = transparent && output.format === "jpeg" ? "png" : output.format;
  const result = await requestImage(openai, prompt, request.references, request.runId, {
    ...output, format, transparent, model, quality: request.quality ?? DEFAULT_IMAGE_QUALITY,
  });
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new ApiError(502, "The image provider returned no image");
  return { bytes: Buffer.from(encoded, "base64"), mimeType: `image/${format}` as const, prompt, revisedPrompt: result.data?.[0]?.revised_prompt || null };
}

/** An AI image at the request's exact size: drawn at the nearest model size, then cropped from the centre. */
async function illustrateAt(openai: OpenAI, request: ImageRequest) {
  const image = await illustrate(openai, request, { format: "webp", size: modelSizeFor(request.size), shape: compositionFor(request.size) });
  const { width, height } = request.size;
  if (modelSizeFor(request.size) === `${width}x${height}`) return image;
  const format = image.mimeType === "image/png" ? "png" : "webp";
  return { ...image, bytes: await sharp(image.bytes).resize(width, height, { fit: "cover" }).toFormat(format).toBuffer() };
}

/**
 * Places the logo on an image with sharp: scaled to fit a fraction of the
 * image, at one of nine grid positions with a margin, keeping the format.
 */
export async function withLogo(image: MadeImage, logo: Logo): Promise<MadeImage> {
  if (!logo || logo.position === "none") return image;
  const base = sharp(image.bytes);
  const { width = 0, height = 0 } = await base.metadata();
  if (!width || !height) return image;
  const mark = await sharp(logo.bytes)
    .resize({ width: logo.width ?? DEFAULT_LOGO_WIDTH, height: Math.round(height * LOGO_MAX_HEIGHT), fit: "inside" })
    .png().toBuffer({ resolveWithObject: true });
  const margin = logo.margin ?? DEFAULT_LOGO_MARGIN;
  const [row, column] = logo.position === "center" ? ["middle", "center"] : logo.position.split("-");
  const place = (where: string, size: number, total: number) =>
    where === "left" || where === "top" ? margin : where === "right" || where === "bottom" ? total - size - margin : Math.round((total - size) / 2);
  const composed = base.composite([{ input: mark.data, left: place(column, mark.info.width, width), top: place(row, mark.info.height, height) }]);
  const format = image.mimeType === "image/webp" ? "webp" : image.mimeType === "image/jpeg" ? "jpeg" : "png";
  return { ...image, bytes: await composed.toFormat(format).toBuffer() };
}

/**
 * The article's thumbnail in the blog's format: an AI image, a brand card with
 * the title, or a brand card with an AI illustration. Only the AI image takes
 * the chosen size; brand cards are always COVER_SIZE (16:9). If the illustration
 * fails, the brand card is still made with the title alone.
 *
 * A brand card's illustration can be passed in (`illustration`) to draw the
 * same card in another language without a new AI image; the one used is
 * returned so callers can reuse it.
 */
export async function makeCover(openai: OpenAI | null, request: ImageRequest & {
  format: ThumbnailFormat; colors: string[]; typography: CoverTypography; title: string; warnings: string[];
  illustration?: CoverIllustration | null;
}): Promise<MadeImage & { illustration: CoverIllustration | null }> {
  if (request.format === "generated") {
    if (!openai) throw new ApiError(412, "Add an OpenAI API key in Settings → Providers to use AI features");
    const image = await illustrateAt(openai, request);
    return { ...await withLogo({ ...image, origin: "generated", model: request.model ?? IMAGE_MODEL }, request.logo ?? null), illustration: null };
  }
  let illustration: CoverIllustration | null = request.format === "template_illustration" ? request.illustration ?? null : null;
  const reused = Boolean(illustration);
  if (request.format === "template_illustration" && !illustration && openai) {
    try {
      illustration = await illustrate(openai, request, { format: "jpeg", size: "1024x1024", shape: "Square composition with one clear subject." });
    } catch (error) {
      request.warnings.push(`The thumbnail illustration could not be generated, so the brand card has only the title: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const png = await renderCoverPng({
    title: request.title, colors: request.colors, typography: request.typography,
    illustration: illustration ? `data:${illustration.mimeType};base64,${illustration.bytes.toString("base64")}` : null,
  });
  const card = await withLogo({
    bytes: png, mimeType: "image/png", origin: "template",
    prompt: illustration?.prompt ?? null, revisedPrompt: illustration?.revisedPrompt, model: illustration && !reused ? request.model ?? IMAGE_MODEL : null,
  }, request.logo ?? null);
  return { ...card, illustration };
}

/** An image inside the article: always an AI illustration. */
export async function makeInlineImage(openai: OpenAI, request: ImageRequest): Promise<MadeImage> {
  const image = await illustrateAt(openai, request);
  return withLogo({ ...image, origin: "generated", model: request.model ?? IMAGE_MODEL }, request.logo ?? null);
}
