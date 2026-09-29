import { describe, expect, it } from "vitest";
import { nextDiscoveryDate, normalizeSitemapUrl, normalizeWebsite, sitemapLocations } from "@/src/server/services/growth/discovery";
import { draftScheduleDates } from "@/src/server/services/growth/planning";

describe("content opportunity discovery", () => {
  it("accepts a friendly website URL and stores only its hostname", () => {
    expect(normalizeWebsite("https://www.Example.com/articles")).toBe("www.example.com");
    expect(normalizeWebsite("example.com")).toBe("example.com");
    expect(() => normalizeWebsite("localhost")).toThrow("public domain");
  });

  it("keeps an explicit sitemap on the same website", () => {
    expect(normalizeSitemapUrl("https://www.example.com/sitemap_index.xml", "example.com"))
      .toBe("https://www.example.com/sitemap_index.xml");
    expect(() => normalizeSitemapUrl("https://other.example/sitemap.xml", "example.com")).toThrow("same website");
  });

  it("extracts and decodes sitemap locations", () => {
    expect(sitemapLocations("<urlset><url><loc>https://example.com/a&amp;b</loc></url><url><loc>https://example.com/c</loc></url></urlset>"))
      .toEqual(["https://example.com/a&b", "https://example.com/c"]);
  });

  it("calculates the next review scan without affecting publication", () => {
    const now = new Date("2026-09-29T10:00:00.000Z");
    expect(nextDiscoveryDate("weekly", now).toISOString()).toBe("2026-10-06T10:00:00.000Z");
    expect(nextDiscoveryDate("monthly", now).toISOString()).toBe("2026-10-29T10:00:00.000Z");
  });

  it("turns a simple weekly pace into visible draft dates", () => {
    const dates = draftScheduleDates(2, 4, new Date("2026-09-29T10:00:00.000Z"));
    expect(dates.map(date => date.toISOString())).toEqual([
      "2026-09-30T09:00:00.000Z",
      "2026-10-03T09:00:00.000Z",
      "2026-10-07T09:00:00.000Z",
      "2026-10-10T09:00:00.000Z",
    ]);
  });
});
