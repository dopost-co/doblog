import { describe, expect, it } from "vitest";
import { splitBySearchData } from "@/src/server/services/growth/discovery";
import { placeInlineImages } from "@/src/server/services/growth/content";

describe("Ideas backed by search data", () => {
  const candidates = [{ keyword: "cómo planificar contenido para redes sociales" }, { keyword: "programar publicaciones instagram" }];

  it("keeps ideas whose keyword was researched and rejects made-up ones", () => {
    const { kept, rejected } = splitBySearchData([
      { keyword: "Cómo planificar contenido para redes sociales" },
      { keyword: "instagram social media scheduler" },
    ], candidates);
    expect(kept.map(idea => idea.keyword)).toEqual(["Cómo planificar contenido para redes sociales"]);
    expect(rejected.map(idea => idea.keyword)).toEqual(["instagram social media scheduler"]);
  });

  it("keeps everything when there was no search data", () => {
    expect(splitBySearchData([{ keyword: "anything" }], []).kept).toHaveLength(1);
  });
});

describe("Post image placement", () => {
  const headings = ["Qué es", "Cómo elegir", "Pasos prácticos", "Herramientas"];

  it("puts an image after the section it names", () => {
    expect([...placeInlineImages(headings, [{ afterHeading: "Cómo elegir" }]).keys()]).toEqual([1]);
  });

  it("never drops an image whose heading was reworded, and spreads them out", () => {
    const placed = placeInlineImages(headings, [{ afterHeading: "Qué es" }, { afterHeading: "Heading that does not exist" }]);
    expect([...placed.values()].flat()).toHaveLength(2);
    expect([...placed.keys()].sort()).toEqual([0, 2]);
  });

  it("does not stack two images on the same section while others are free", () => {
    const placed = placeInlineImages(headings, [{ afterHeading: "Qué es" }, { afterHeading: "Qué es" }]);
    expect([...placed.values()].every(images => images.length === 1)).toBe(true);
  });
});
