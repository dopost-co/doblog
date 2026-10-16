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

/** Legacy height guard plus the pixel defaults exposed by the CMS. */
export const LOGO_MAX_HEIGHT = 0.14;
