/**
 * Brand thumbnail, drawn to a PNG on the server with next/og (Satori): only
 * flexbox and inline styles work here, no Tailwind classes. Change the look
 * of every template thumbnail by editing this file.
 */
import { COVER_SIZE, gradientCss, textColorFor, type CoverTypography } from "@/lib/autopilot/thumbnail-templates";

export type CoverTemplateProps = {
  /** Already fitted to the box from coverTitleBox (see renderCoverPng). */
  title: string;
  titleSize: number;
  /** Tracking in em for the chosen font. */
  tracking: number;
  blogName: string;
  /** Two or three gradient colors. */
  colors: string[];
  typography: CoverTypography;
  /** Data URL of the illustration, or a placeholder box when previewing. */
  illustration?: string | "placeholder" | null;
};

/** The font family name the template draws with; renderCoverPng registers the chosen font under it. */
export const COVER_FONT_FAMILY = "Cover";

const PADDING = { plain: 72, illustrated: 56 };
const ILLUSTRATION_WIDTH = 540;
const GAP = 48;
const LINE_HEIGHT = 1.15;
/**
 * Largest and smallest title size per setting. The ranges are narrow and do not
 * overlap, so S, M and L stay visibly different: headlines are a few words
 * (see lib/autopilot/cover-title.ts), so there is no need to shrink far to fit,
 * and a wide range used to collapse every setting onto the same small size.
 */
const SIZES = {
  plain: { small: [56, 48], medium: [72, 62], large: [88, 76] },
  illustrated: { small: [40, 34], medium: [52, 44], large: [64, 54] },
} as const;

/** Where the title must fit: the text column's width, its line limit and the size range. */
export function coverTitleBox(withIllustration: boolean, size: CoverTypography["size"]) {
  const layout = withIllustration ? "illustrated" : "plain";
  const width = withIllustration
    ? COVER_SIZE.width - PADDING.illustrated * 2 - GAP - ILLUSTRATION_WIDTH
    : COVER_SIZE.width - PADDING.plain * 2;
  const [maxSize, minSize] = SIZES[layout][size];
  // A headline is a few words; the narrow column beside an illustration needs
  // one more line for the same text. Five lines only ever fitted a full article
  // title, and shrinking type to reach it is what made S, M and L look alike.
  return { width, maxLines: withIllustration ? 4 : 3, maxSize, minSize };
}

export function CoverTemplate({ title, titleSize, tracking, blogName, colors, typography, illustration }: CoverTemplateProps) {
  const color = textColorFor(colors);
  const withIllustration = Boolean(illustration);
  const centered = typography.align === "center";
  const { maxLines } = coverTitleBox(withIllustration, typography.size);

  return (
    <div
      style={{
        width: COVER_SIZE.width,
        height: COVER_SIZE.height,
        display: "flex",
        padding: withIllustration ? PADDING.illustrated : PADDING.plain,
        gap: GAP,
        backgroundImage: gradientCss(colors),
        color,
        fontFamily: COVER_FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column", flex: 1, gap: 28,
          justifyContent: centered ? "center" : typography.showBlogName ? "space-between" : "flex-end",
          alignItems: centered ? "center" : "flex-start",
          textAlign: centered ? "center" : "left",
        }}
      >
        {typography.showBlogName && (
          <div style={{ display: "block", fontSize: withIllustration ? 22 : 26, fontWeight: 700, opacity: 0.8, lineClamp: 1, textOverflow: "ellipsis", overflow: "hidden" } as React.CSSProperties}>
            {blogName}
          </div>
        )}
        <div
          style={{
            display: "block", fontSize: titleSize, fontWeight: typography.bold ? 700 : 400, lineHeight: LINE_HEIGHT,
            letterSpacing: tracking * titleSize, wordBreak: "break-word",
            // Safety net only: the title is already fitted to these lines.
            lineClamp: maxLines, textOverflow: "ellipsis", overflow: "hidden",
          } as React.CSSProperties}
        >
          {title}
        </div>
      </div>
      {illustration === "placeholder" ? (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: ILLUSTRATION_WIDTH, height: "100%",
            borderRadius: 28, border: `3px dashed ${color}`, opacity: 0.45, fontSize: 26,
          }}
        >
          Illustration
        </div>
      ) : illustration ? (
        // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
        <img src={illustration} alt="" width={ILLUSTRATION_WIDTH} height={563} style={{ width: ILLUSTRATION_WIDTH, height: "100%", objectFit: "cover", borderRadius: 28 }} />
      ) : null}
    </div>
  );
}
