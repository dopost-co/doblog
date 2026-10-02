import { normalizeKeyword } from "@/src/server/services/growth/content";

/** One keyword with the DataForSEO Labs metrics Autopilot plans from. */
export type KeywordMetrics = {
  keyword?: unknown; searchVolume?: unknown; cpc?: unknown; competition?: unknown;
  difficulty?: unknown; intent?: unknown; position?: unknown; url?: unknown;
  competitorPosition?: unknown; competitorUrl?: unknown;
};

export type KeywordCandidate = {
  keyword: string; searchVolume: number | null; difficulty: number | null; intent: string | null;
  cpc: number | null; source: "keyword_ideas" | "competitor_gap"; competitorUrl?: string; opportunity: number;
};

/** Below this the site has no ranking history and should aim at easy keywords. */
export const DEFAULT_MAX_DIFFICULTY = 35;

// Blog articles win informational and comparison searches; product and brand searches go to shops and homepages.
const INTENT_WEIGHT: Record<string, number> = { informational: 1, commercial: 1.1, transactional: 0.6, navigational: 0.15 };

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * How hard a keyword this site can realistically win: a little above the
 * difficulty of keywords it already holds on page one.
 */
export function difficultyCeiling(ranked: KeywordMetrics[]) {
  const held = ranked.filter(item => (num(item.position) ?? 99) <= 10).map(item => num(item.difficulty)).filter((value): value is number => value !== null);
  if (held.length < 3) return DEFAULT_MAX_DIFFICULTY;
  const sorted = [...held].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.min(80, Math.max(DEFAULT_MAX_DIFFICULTY, Math.round(median + 15)));
}

/** Demand weighted by how winnable the keyword is and how well a blog article fits its intent. */
export function opportunityScore(item: KeywordMetrics, maxDifficulty: number) {
  const volume = num(item.searchVolume) ?? 0;
  const difficulty = num(item.difficulty);
  if (difficulty !== null && difficulty > maxDifficulty) return 0;
  const ease = 1 - (difficulty ?? maxDifficulty / 2) / 100;
  const intent = INTENT_WEIGHT[String(item.intent || "informational")] ?? 0.8;
  return Number((Math.log10(volume + 1) * ease * intent * 10).toFixed(2));
}

/**
 * Merges keyword ideas and competitor gaps into one ranked list, leaving out
 * keywords the site already covers or ranks for and competitors' brand searches.
 */
export function rankKeywordCandidates({ ideas, gaps, covered, competitorDomains, maxDifficulty, limit = 60 }: {
  ideas: KeywordMetrics[]; gaps: KeywordMetrics[]; covered: Set<string>;
  competitorDomains: string[]; maxDifficulty: number; limit?: number;
}): KeywordCandidate[] {
  const brands = competitorDomains.map(domain => domain.replace(/^www\./, "").split(".")[0]).filter(label => label.length >= 3);
  const best = new Map<string, KeywordCandidate>();
  const add = (item: KeywordMetrics, source: KeywordCandidate["source"]) => {
    const keyword = typeof item.keyword === "string" ? item.keyword.trim() : "";
    const key = normalizeKeyword(keyword);
    if (!key || covered.has(key)) return;
    if (brands.some(brand => key.replace(/\s+/g, "").includes(brand))) return;
    const opportunity = opportunityScore(item, maxDifficulty);
    if (opportunity <= 0) return;
    const candidate: KeywordCandidate = {
      keyword, searchVolume: num(item.searchVolume), difficulty: num(item.difficulty),
      intent: typeof item.intent === "string" ? item.intent : null, cpc: num(item.cpc), source, opportunity,
      ...(source === "competitor_gap" && typeof item.competitorUrl === "string" ? { competitorUrl: item.competitorUrl } : {}),
    };
    const previous = best.get(key);
    // Gaps go first: a competitor already ranking proves the topic fits the niche, so ideas never replace that evidence.
    if (!previous || (previous.source === source && candidate.opportunity > previous.opportunity)) best.set(key, candidate);
  };
  for (const item of gaps) add(item, "competitor_gap");
  for (const item of ideas) add(item, "keyword_ideas");
  return [...best.values()].sort((a, b) => b.opportunity - a.opportunity).slice(0, limit);
}
