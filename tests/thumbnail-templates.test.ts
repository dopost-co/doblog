import { describe, expect, it } from "vitest";
import { COVER_FONTS, DEFAULT_COVER_TYPOGRAPHY, DEFAULT_THUMBNAIL_COLORS, coverTypography, isThumbnailFormat, textColorFor, thumbnailColors } from "@/lib/autopilot/thumbnail-templates";
import { coverTitleBox } from "@/components/Growth/CoverTemplate";
import { fitTitle } from "@/src/server/services/growth/cover-fonts";
import { renderCoverPng } from "@/src/server/services/growth/cover-render";

/** Width and height from a PNG header. */
const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

describe("Brand thumbnail settings", () => {
  it("falls back to the default gradient and ignores invalid colors", () => {
    expect(thumbnailColors([])).toEqual([...DEFAULT_THUMBNAIL_COLORS]);
    expect(thumbnailColors(["#FF0000"])).toEqual(["#ff0000", "#ff0000"]);
    expect(thumbnailColors(["red", "#00ff00"])).toEqual(["#00ff00", "#00ff00"]);
  });

  it("picks the text color that contrasts with the gradient", () => {
    expect(textColorFor(["#1e1b4b", "#6d28d9"])).toBe("#ffffff");
    expect(textColorFor(["#f5f3ff", "#c4b5fd"])).toBe("#111111");
  });

  it("keeps up to three gradient colors", () => {
    expect(DEFAULT_THUMBNAIL_COLORS).toEqual(["#1e1b4b", "#6d28d9"]);
    expect(thumbnailColors(["#111111", "#222222", "#333333", "#444444"])).toEqual(["#111111", "#222222", "#333333"]);
    expect(textColorFor(["#9f1239", "#86198f", "#075985"])).toBe("#ffffff");
  });

  it("knows the formats", () => {
    expect(isThumbnailFormat("template_illustration")).toBe(true);
    expect(isThumbnailFormat("banner")).toBe(false);
  });
});

describe("Brand card text", () => {
  it("fills in missing or unknown typography with the defaults", () => {
    expect(coverTypography(null)).toEqual(DEFAULT_COVER_TYPOGRAPHY);
    expect(coverTypography({ font: "comic-sans", size: "large", bold: "yes", align: "center" }))
      .toEqual({ ...DEFAULT_COVER_TYPOGRAPHY, size: "large", align: "center" });
  });

  const plain = coverTitleBox(false, "medium");
  const long = "How to plan a whole month of blog articles in a single afternoon without losing quality or your brand's voice, with real examples, checklists and templates you can copy today";

  it("keeps short titles at the chosen size", () => {
    expect(fitTitle("Plan a month of articles", "inter", 700, plain)).toEqual({ text: "Plan a month of articles", size: plain.maxSize });
  });

  it("shrinks longer titles before cutting them", () => {
    const fitted = fitTitle("How to plan a whole month of blog articles in a single afternoon without losing quality", "inter", 700, plain);
    expect(fitted.size).toBeLessThan(plain.maxSize);
    expect(fitted.size).toBeGreaterThanOrEqual(plain.minSize);
    expect(fitted.text.endsWith("…")).toBe(false);
  });

  it("cuts titles that do not fit at the smallest size at a whole word", () => {
    for (const font of COVER_FONTS) {
      const fitted = fitTitle(long, font.id, 700, plain);
      expect(fitted.size).toBe(plain.minSize);
      expect(fitted.text.endsWith("…")).toBe(true);
      expect(long.startsWith(fitted.text.slice(0, -1))).toBe(true);
      expect(long[fitted.text.length - 1]).toMatch(/[\s,]/);
    }
  });

  it("allows more lines beside the illustration", () => {
    expect(coverTitleBox(true, "medium").maxLines).toBeGreaterThan(plain.maxLines);
  });
});

describe("Rendering brand thumbnails", () => {
  it("draws a 1200×675 PNG with the title, with or without an illustration", async () => {
    const card = await renderCoverPng({ title: "How to plan a month of articles", blogName: "Zenex", colors: [...DEFAULT_THUMBNAIL_COLORS], typography: DEFAULT_COVER_TYPOGRAPHY });
    expect(card.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(pngSize(card)).toEqual({ width: 1200, height: 675 });

    // A 1×1 PNG stands in for the AI illustration.
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const withIllustration = await renderCoverPng({ title: "A very long title ".repeat(10), blogName: "Zenex", colors: ["#f5f3ff", "#c4b5fd"], illustration: `data:image/png;base64,${pixel}`, typography: { ...DEFAULT_COVER_TYPOGRAPHY, font: "playfair-display", align: "center" } });
    expect(pngSize(withIllustration)).toEqual({ width: 1200, height: 675 });

    for (const font of COVER_FONTS) {
      const card = await renderCoverPng({ title: "Ñandú, café y acentos", blogName: "Zenex", colors: [...DEFAULT_THUMBNAIL_COLORS], typography: { ...DEFAULT_COVER_TYPOGRAPHY, font: font.id, bold: false } });
      expect(pngSize(card)).toEqual({ width: 1200, height: 675 });
    }
  }, 20_000);
});
