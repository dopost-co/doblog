import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CoverFont } from "@/lib/autopilot/thumbnail-templates";

/**
 * Fonts for brand thumbnails and the measuring needed to fit a title: Satori
 * cannot report how text wrapped, so lines are worked out here from the same
 * font files' glyph widths before drawing.
 */
type Weight = 400 | 700;

/** Tighter tracking reads better at headline sizes; monospace stays as designed. */
export const FONT_TRACKING: Record<CoverFont, number> = {
  "inter": -0.02, "playfair-display": -0.01, "space-grotesk": -0.02, "jetbrains-mono": 0,
};

type Metrics = { advance: (code: number) => number };
const files = new Map<string, Buffer>();
const metrics = new Map<string, Metrics>();

export function fontFile(font: CoverFont, weight: Weight) {
  const key = `${font}-${weight}`;
  let data = files.get(key);
  if (!data) {
    data = readFileSync(join(process.cwd(), "assets/fonts", `${key}.ttf`));
    files.set(key, data);
  }
  return data;
}

/** Horizontal advance of each character in em, read from the TTF's cmap and hmtx tables. */
function readMetrics(data: Buffer): Metrics {
  const tables = new Map<string, number>();
  for (let i = 0, count = data.readUInt16BE(4); i < count; i++) {
    const record = 12 + i * 16;
    tables.set(data.toString("latin1", record, record + 4), data.readUInt32BE(record + 8));
  }
  const head = tables.get("head")!, hhea = tables.get("hhea")!, hmtx = tables.get("hmtx")!, cmap = tables.get("cmap")!;
  const unitsPerEm = data.readUInt16BE(head + 18);
  const longMetrics = data.readUInt16BE(hhea + 34);
  const advanceOf = (glyph: number) => data.readUInt16BE(hmtx + Math.min(glyph, longMetrics - 1) * 4) / unitsPerEm;

  // Prefer the full Unicode map (format 12), then the BMP one (format 4).
  let format12 = 0, format4 = 0;
  for (let i = 0, count = data.readUInt16BE(cmap + 2); i < count; i++) {
    const record = cmap + 4 + i * 8;
    const offset = cmap + data.readUInt32BE(record + 4);
    const format = data.readUInt16BE(offset);
    if (format === 12) format12 = offset;
    else if (format === 4 && (data.readUInt16BE(record) === 3 || data.readUInt16BE(record) === 0)) format4 = offset;
  }
  const glyphOf = (code: number) => {
    if (format12) {
      for (let i = 0, groups = data.readUInt32BE(format12 + 12); i < groups; i++) {
        const group = format12 + 16 + i * 12;
        if (code >= data.readUInt32BE(group) && code <= data.readUInt32BE(group + 4)) return data.readUInt32BE(group + 8) + code - data.readUInt32BE(group);
      }
      return 0;
    }
    if (!format4 || code > 0xffff) return 0;
    const segments = data.readUInt16BE(format4 + 6) / 2;
    const ends = format4 + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
    for (let i = 0; i < segments; i++) {
      if (data.readUInt16BE(ends + i * 2) < code) continue;
      const start = data.readUInt16BE(starts + i * 2);
      if (start > code) return 0;
      const delta = data.readInt16BE(deltas + i * 2), range = data.readUInt16BE(ranges + i * 2);
      if (!range) return (code + delta) & 0xffff;
      const glyph = data.readUInt16BE(ranges + i * 2 + range + (code - start) * 2);
      return glyph ? (glyph + delta) & 0xffff : 0;
    }
    return 0;
  };

  const cache = new Map<number, number>();
  // Characters the font lacks are drawn by a fallback; assume a wide glyph.
  const fallback = advanceOf(glyphOf(0x4d) || 0);
  return {
    advance(code) {
      let width = cache.get(code);
      if (width === undefined) {
        const glyph = glyphOf(code);
        width = glyph ? advanceOf(glyph) : fallback;
        cache.set(code, width);
      }
      return width;
    },
  };
}

function metricsFor(font: CoverFont, weight: Weight) {
  const key = `${font}-${weight}`;
  let found = metrics.get(key);
  if (!found) {
    found = readMetrics(fontFile(font, weight));
    metrics.set(key, found);
  }
  return found;
}

export type TitleBox = { width: number; maxLines: number; maxSize: number; minSize: number };

/** Width of a string in px at a size, with the font's tracking. */
function measure(text: string, size: number, font: CoverFont, weight: Weight) {
  const { advance } = metricsFor(font, weight);
  let em = 0;
  for (const char of text) em += advance(char.codePointAt(0)!) + FONT_TRACKING[font];
  return em * size;
}

/** Lines the words take when wrapped greedily, as Satori does; overlong words break across lines. */
function lineCount(words: string[], size: number, width: number, font: CoverFont, weight: Weight) {
  const space = measure(" ", size, font, weight);
  let lines = 1, used = 0;
  for (const word of words) {
    const length = measure(word, size, font, weight);
    if (used && used + space + length <= width) { used += space + length; continue; }
    if (used) lines += 1;
    lines += Math.max(0, Math.ceil(length / width) - 1);
    used = length % width || width;
  }
  return lines;
}

/**
 * The title at the largest size from maxSize down to minSize that fits in
 * maxLines. If even minSize is too small, the title is cut at a word and ends
 * in "…", so it never stops mid-word.
 */
export function fitTitle(title: string, font: CoverFont, weight: Weight, box: TitleBox) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  // A small margin covers kerning and rounding differences with the renderer.
  const width = box.width * 0.97;
  for (let size = box.maxSize; size >= box.minSize; size -= 2) {
    if (lineCount(words, size, width, font, weight) <= box.maxLines) return { text: words.join(" "), size };
  }
  const kept = [...words];
  while (kept.length > 1) {
    kept.pop();
    const text = `${kept.join(" ").replace(/[\s,.;:!?¡¿\-–—]+$/u, "")}…`;
    if (lineCount(text.split(" "), box.minSize, width, font, weight) <= box.maxLines) return { text, size: box.minSize };
  }
  return { text: kept[0] ?? "", size: box.minSize };
}
