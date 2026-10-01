/**
 * Thumbnail formats for Autopilot articles. To tweak the look of the brand
 * templates, edit components/Growth/CoverTemplate.tsx; this file only holds
 * the options and colors.
 */
export const THUMBNAIL_FORMATS = [
  { id: "generated", title: "Illustration", example: "An AI image for each article." },
  { id: "template", title: "Brand card", example: "Your gradient with the title. No AI image." },
  { id: "template_illustration", title: "Card + illustration", example: "Your gradient, an AI illustration and the title." },
] as const;

export type ThumbnailFormat = typeof THUMBNAIL_FORMATS[number]["id"];

/** The brand card's background: a diagonal gradient through the colors. */
export function gradientCss(colors: readonly string[]) {
  return `linear-gradient(315deg, ${colors.join(", ")})`;
}

export const DEFAULT_THUMBNAIL_COLORS: readonly string[] = ["#1e1b4b", "#6d28d9"];
/** Gradients use two or three colors. */
export const MAX_GRADIENT_COLORS = 3;

/** Fonts for the brand card's text (files in assets/fonts, all SIL Open Font License). */
export const COVER_FONTS = [
  { id: "inter", name: "Inter" },
  { id: "playfair-display", name: "Playfair Display" },
  { id: "space-grotesk", name: "Space Grotesk" },
  { id: "jetbrains-mono", name: "JetBrains Mono" },
] as const;
export const COVER_TEXT_SIZES = ["small", "medium", "large"] as const;
export const COVER_TEXT_ALIGNS = ["left", "center"] as const;

export type CoverFont = typeof COVER_FONTS[number]["id"];
export type CoverTypography = {
  font: CoverFont;
  /** The largest the title gets; long titles shrink from there to fit. */
  size: typeof COVER_TEXT_SIZES[number];
  bold: boolean;
  align: typeof COVER_TEXT_ALIGNS[number];
};

export const DEFAULT_COVER_TYPOGRAPHY: CoverTypography = { font: "inter", size: "medium", bold: true, align: "left" };

/** Saved typography (any shape) with every missing or unknown value set to the default. */
export function coverTypography(value: unknown): CoverTypography {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const pick = <T,>(options: readonly T[], candidate: unknown, fallback: T) => (options.includes(candidate as T) ? candidate as T : fallback);
  return {
    font: pick(COVER_FONTS.map((font) => font.id), raw.font, DEFAULT_COVER_TYPOGRAPHY.font),
    size: pick(COVER_TEXT_SIZES, raw.size, DEFAULT_COVER_TYPOGRAPHY.size),
    bold: typeof raw.bold === "boolean" ? raw.bold : DEFAULT_COVER_TYPOGRAPHY.bold,
    align: pick(COVER_TEXT_ALIGNS, raw.align, DEFAULT_COVER_TYPOGRAPHY.align),
  };
}

/** Standard social/Discover size: 16:9 and at least 1200 px wide. */
export const COVER_SIZE = { width: 1200, height: 675 } as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function isThumbnailFormat(value: unknown): value is ThumbnailFormat {
  return THUMBNAIL_FORMATS.some((format) => format.id === value);
}

/** The gradient's valid #rrggbb colors (two or three), falling back to the default. */
export function thumbnailColors(colors: readonly string[] | null | undefined): string[] {
  const valid = (colors ?? []).filter((color) => HEX.test(color)).map((color) => color.toLowerCase()).slice(0, MAX_GRADIENT_COLORS);
  if (valid.length >= 2) return valid;
  return valid.length === 1 ? [valid[0], valid[0]] : [...DEFAULT_THUMBNAIL_COLORS];
}

export function isHexColor(value: string) {
  return HEX.test(value);
}

/** White or near-black text, whichever contrasts more with the gradient (WCAG luminance). */
export function textColorFor(colors: readonly string[]) {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  // Above ~0.18 black text has the higher contrast ratio, below it white does.
  const average = colors.reduce((sum, color) => sum + luminance(color), 0) / Math.max(colors.length, 1);
  return average > 0.18 ? "#111111" : "#ffffff";
}
