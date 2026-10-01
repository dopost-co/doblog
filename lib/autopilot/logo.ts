/** Where the brand logo goes on a generated image: a 3×3 grid, or nowhere. */
export const LOGO_POSITIONS = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

export type LogoPosition = typeof LOGO_POSITIONS[number] | "none";

export function isLogoPosition(value: unknown): value is LogoPosition {
  return value === "none" || LOGO_POSITIONS.includes(value as typeof LOGO_POSITIONS[number]);
}

/** Logo size and margin relative to the image, so it looks the same at any resolution. */
export const LOGO_MAX_WIDTH = 0.16;
export const LOGO_MAX_HEIGHT = 0.14;
export const LOGO_MARGIN = 0.04;
