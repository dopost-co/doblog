import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { withLogo, type MadeImage } from "@/src/server/services/growth/images";

const WHITE = { r: 255, g: 255, b: 255 };
const RED = { r: 255, g: 0, b: 0 };

async function base(format: "png" | "webp" = "png"): Promise<MadeImage> {
  const bytes = await sharp({ create: { width: 1200, height: 675, channels: 3, background: WHITE } }).toFormat(format).toBuffer();
  return { bytes, mimeType: format === "png" ? "image/png" : "image/webp", origin: "generated", prompt: null, model: null };
}
const logo = () => sharp({ create: { width: 400, height: 100, channels: 4, background: { ...RED, alpha: 1 } } }).png().toBuffer();

/** RGB of one pixel. */
async function pixel(bytes: Buffer, x: number, y: number) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

describe("Logo on generated images", () => {
  it("places the logo in the chosen corner, scaled, with a margin", async () => {
    const result = await withLogo(await base(), { bytes: await logo(), position: "bottom-right" });
    // Default logo is 140 px wide (35 px tall), with a fixed 32 px margin.
    expect(await pixel(result.bytes, 1200 - 32 - 10, 675 - 32 - 10)).toEqual(RED);
    expect(await pixel(result.bytes, 1200 - 32 - 150, 675 - 32 - 10)).toEqual(WHITE);
    expect(await pixel(result.bytes, 10, 10)).toEqual(WHITE);
    const meta = await sharp(result.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 675, "png"]);
  });

  it("centers it", async () => {
    const result = await withLogo(await base(), { bytes: await logo(), position: "center" });
    expect(await pixel(result.bytes, 600, 337)).toEqual(RED);
    expect(await pixel(result.bytes, 600, 337 - 40)).toEqual(WHITE);
  });

  it("keeps the image format", async () => {
    const result = await withLogo(await base("webp"), { bytes: await logo(), position: "top-left" });
    expect(result.mimeType).toBe("image/webp");
    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
  });

  it("leaves the image untouched without a position", async () => {
    const image = await base();
    expect(await withLogo(image, { bytes: await logo(), position: "none" })).toBe(image);
    expect(await withLogo(image, null)).toBe(image);
  });
});
