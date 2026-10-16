import { z } from "zod";
import { IMAGE_SIZES, MAX_IMAGE_STYLE_LENGTH, type ImageSizeId } from "./image-sizes";
import { LOGO_POSITIONS } from "./logo";

/** Image-provider options exposed by the CMS. Keep this list explicit: a typo must not spend credits on a surprise model. */
export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export const IMAGE_MODES = ["direct"] as const;
export const DEFAULT_IMAGE_MODEL = "gpt-image-2" as const;
export const DEFAULT_IMAGE_QUALITY = "medium" as const;
export const DEFAULT_IMAGE_MODE = "direct" as const;
export const DEFAULT_IMAGE_VARIANTS = 1 as const;
export const DEFAULT_LOGO_WIDTH = 140;
export const DEFAULT_LOGO_MARGIN = 32;
export const MIN_LOGO_WIDTH = 80;
export const MAX_LOGO_WIDTH = 240;

export type ImageModel = typeof IMAGE_MODELS[number];
export type ImageQuality = typeof IMAGE_QUALITIES[number];
export type ImageMode = typeof IMAGE_MODES[number];

export const imageModelSchema = z.enum(IMAGE_MODELS);
export const imageQualitySchema = z.enum(IMAGE_QUALITIES);
export const imageModeSchema = z.enum(IMAGE_MODES);

export function imageModel(value: unknown): ImageModel {
  return IMAGE_MODELS.includes(value as ImageModel) ? value as ImageModel : DEFAULT_IMAGE_MODEL;
}

export function imageQuality(value: unknown): ImageQuality {
  return IMAGE_QUALITIES.includes(value as ImageQuality) ? value as ImageQuality : DEFAULT_IMAGE_QUALITY;
}

const exactSizes = IMAGE_SIZES.map((size) => `${size.width}x${size.height}`) as [string, ...string[]];
export const imageOutputSizeSchema = z.union([
  z.enum(IMAGE_SIZES.map((size) => size.id) as [ImageSizeId, ...ImageSizeId[]]),
  z.enum(exactSizes),
]);

export function imageSizeId(value: string): ImageSizeId {
  const matched = IMAGE_SIZES.find((size) => size.id === value || `${size.width}x${size.height}` === value);
  return matched?.id ?? "standard";
}

/**
 * Compact MCP representation of the visual defaults. `titles` is accepted as
 * context from image-generation clients, but is not persisted: CMS articles
 * always supply their own title when an image is generated.
 */
export const imageGenerationConfigSchema = z.object({
  titles: z.union([z.string().trim().min(1).max(300), z.array(z.string().trim().min(1).max(300)).min(1).max(20)]).optional(),
  stylePrompt: z.string().trim().max(MAX_IMAGE_STYLE_LENGTH).nullable().optional(),
  conceptPrompt: z.string().trim().max(MAX_IMAGE_STYLE_LENGTH).nullable().optional(),
  model: imageModelSchema.optional(),
  quality: imageQualitySchema.optional(),
  size: imageOutputSizeSchema.optional(),
  mode: imageModeSchema.optional(),
  variants: z.literal(1).optional().describe("One final image per slot; variants above 1 are intentionally unsupported to avoid silently multiplying cost."),
  logo: z.object({
    enabled: z.boolean(),
    position: z.enum(LOGO_POSITIONS),
    width: z.number().int().min(MIN_LOGO_WIDTH).max(MAX_LOGO_WIDTH),
    margin: z.number().int().min(0).max(128).default(DEFAULT_LOGO_MARGIN),
  }).strict().optional(),
}).strict();
