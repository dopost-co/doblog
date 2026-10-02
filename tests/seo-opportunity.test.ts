import { describe, expect, it } from "vitest";
import { normalizeSeoResponse } from "@/src/server/services/seo/service";
import { DEFAULT_MAX_DIFFICULTY, difficultyCeiling, opportunityScore, rankKeywordCandidates } from "@/src/server/services/seo/opportunity";
import { defaultSearchMarket } from "@/lib/autopilot/search-markets";

const labs = (keyword: string, volume: number, difficulty: number, intent = "informational") => ({
  keyword_data: { keyword, keyword_info: { search_volume: volume }, keyword_properties: { keyword_difficulty: difficulty }, search_intent_info: { main_intent: intent } },
});

describe("SEO research normalization", () => {
  it("reads the site's ranked keywords with position and URL", () => {
    const normalized = normalizeSeoResponse("ranked_keywords", { tasks: [{ result: [{ total_count: 1, items: [{
      ...labs("crm para pymes", 900, 42), ranked_serp_element: { serp_item: { rank_group: 14, url: "https://example.com/crm" } },
    }] }] }] });
    expect(normalized.items).toEqual([{ keyword: "crm para pymes", searchVolume: 900, cpc: undefined, competition: undefined, difficulty: 42, intent: "informational", position: 14, url: "https://example.com/crm" }]);
  });

  it("reads competitor gaps with the competitor's ranking page", () => {
    const normalized = normalizeSeoResponse("competitor_gap", { tasks: [{ result: [{ items: [{
      ...labs("qué es un crm", 2400, 30), first_domain_serp_element: { rank_group: 3, url: "https://rival.com/crm" },
    }] }] }] });
    expect(normalized.items).toMatchObject([{ keyword: "qué es un crm", competitorPosition: 3, competitorUrl: "https://rival.com/crm" }]);
  });

  it("keeps related searches and the featured snippet from the SERP", () => {
    const normalized = normalizeSeoResponse("serp_brief", { tasks: [{ result: [{ keyword: "crm", items: [
      { type: "featured_snippet", title: "CRM", url: "https://wiki.example/crm", description: "A CRM is…" },
      { type: "related_searches", items: ["crm gratis", "crm hubspot"] },
      { type: "ai_overview" },
    ] }] }] });
    expect(normalized).toMatchObject({ relatedSearches: ["crm gratis", "crm hubspot"], featuredSnippet: { url: "https://wiki.example/crm" }, hasAiOverview: true });
  });
});

describe("keyword opportunities", () => {
  it("prefers winnable keywords over raw volume", () => {
    const hard = opportunityScore({ searchVolume: 50_000, difficulty: 34, intent: "informational" }, 35);
    const easy = opportunityScore({ searchVolume: 5_000, difficulty: 5, intent: "informational" }, 35);
    expect(easy).toBeGreaterThan(0);
    expect(opportunityScore({ searchVolume: 50_000, difficulty: 70 }, 35)).toBe(0);
    expect(hard).toBeGreaterThan(0);
    expect(opportunityScore({ searchVolume: 5_000, difficulty: 5, intent: "navigational" }, 35)).toBeLessThan(easy);
  });

  it("raises the difficulty ceiling for sites that already hold harder keywords", () => {
    expect(difficultyCeiling([])).toBe(DEFAULT_MAX_DIFFICULTY);
    const held = [40, 50, 55].map(difficulty => ({ position: 4, difficulty }));
    expect(difficultyCeiling(held)).toBe(65);
  });

  it("drops covered keywords and competitor brands and keeps gap evidence", () => {
    const ranked = rankKeywordCandidates({
      ideas: [
        { keyword: "qué es un crm", searchVolume: 2400, difficulty: 30, intent: "informational" },
        { keyword: "crm para pymes", searchVolume: 900, difficulty: 20 },
        { keyword: "rival login", searchVolume: 5000, difficulty: 5 },
      ],
      gaps: [{ keyword: "Qué es un CRM", searchVolume: 2400, difficulty: 30, intent: "informational", competitorUrl: "https://rival.com/crm" }],
      covered: new Set(["crm para pymes"]), competitorDomains: ["rival.com"], maxDifficulty: 35,
    });
    expect(ranked.map(item => item.keyword)).toEqual(["Qué es un CRM"]);
    expect(ranked[0]).toMatchObject({ source: "competitor_gap", competitorUrl: "https://rival.com/crm" });
  });

  it("measures each language in its main market", () => {
    expect(defaultSearchMarket("es")).toBe(2724);
    expect(defaultSearchMarket("en")).toBe(2840);
    expect(defaultSearchMarket("ja")).toBe(2840);
  });
});
