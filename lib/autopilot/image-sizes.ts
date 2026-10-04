/**
 * Output sizes for AI images. GPT image models only draw at 1024x1024,
 * 1536x1024 or 1024x1536, so each preset is drawn at the closest of those and
 * then cropped and scaled to its exact size.
 */
export const IMAGE_SIZES = [
  { id: "standard", tag: "Standard", ratio: "16:9", width: 1200, height: 675, hint: "Blog cards, Google Discover and most site themes." },
  { id: "social", tag: "Social preview", ratio: "1.91:1", width: 1200, height: 630, hint: "Link previews on X, LinkedIn, Facebook and Slack." },
  { id: "original", tag: "Original", ratio: "3:2", width: 1536, height: 1024, hint: "The model's own landscape size, with nothing cropped." },
  { id: "classic", tag: "Classic", ratio: "4:3", width: 1200, height: 900, hint: "Taller landscape for themes with 4:3 cards." },
  { id: "square", tag: "Square", ratio: "1:1", width: 1080, height: 1080, hint: "Square cards and Instagram." },
  { id: "portrait", tag: "Portrait", ratio: "2:3", width: 1024, height: 1536, hint: "Tall images such as Pinterest pins." },
] as const;

export type ImageSizeId = typeof IMAGE_SIZES[number]["id"];
export type ImageSize = typeof IMAGE_SIZES[number];
export type ModelImageSize = "1536x1024" | "1024x1024" | "1024x1536";

export const DEFAULT_IMAGE_SIZE: ImageSizeId = "standard";

export function isImageSize(value: unknown): value is ImageSizeId {
  return IMAGE_SIZES.some((size) => size.id === value);
}

export function imageSize(value: unknown): ImageSize {
  return IMAGE_SIZES.find((size) => size.id === value) ?? IMAGE_SIZES[0];
}

/** The model size closest in shape, so cropping removes as little as possible. */
export function modelSizeFor(size: ImageSize): ModelImageSize {
  const ratio = size.width / size.height;
  return ratio > 1.2 ? "1536x1024" : ratio < 0.83 ? "1024x1536" : "1024x1024";
}

/** Prompt line telling the model the final shape and that edges may be trimmed. */
export function compositionFor(size: ImageSize) {
  const shape = size.width > size.height ? "landscape" : size.width < size.height ? "portrait" : "square";
  const cropped = modelSizeFor(size).split("x").map(Number).reduce((w, h) => w / h) !== size.width / size.height;
  return `${size.ratio} ${shape} composition.${cropped ? " Keep the subject centred with some space around it, as the edges are trimmed to fit." : ""}`;
}
