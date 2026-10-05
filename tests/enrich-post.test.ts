import { describe, expect, it } from "vitest";
import { sectionEnd } from "@/src/server/services/growth/enrich";

const h = (level: number) => ({ type: "header", data: { level, text: "h" } });
const p = { type: "paragraph", data: { text: "p" } };

describe("Images added to an existing article", () => {
  const blocks = [p, h(2), p, p, h(3), p, h(2), p, h(2), h(3), p];

  it("go at the end of the section, including its subsections", () => {
    expect(sectionEnd(blocks, 1)).toBe(6);
    expect(sectionEnd(blocks, 4)).toBe(6);
    expect(sectionEnd(blocks, 6)).toBe(8);
  });

  it("go at the end of the article after the last section", () => {
    expect(sectionEnd(blocks, 9)).toBe(blocks.length);
    expect(sectionEnd(blocks, 8)).toBe(blocks.length);
  });
});
