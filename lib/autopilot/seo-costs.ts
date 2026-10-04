/** What each DataForSEO request is expected to cost, in USD millionths, checked against the budgets before calling. */
export const SEO_COST_ESTIMATE_MICROS = {
  keyword_ideas: 50_000,
  search_intent: 10_000,
  serp_brief: 3_000,
  ranked_keywords: 40_000,
  competitor_gap: 30_000,
} as const;

/** The most expensive request Autopilot makes; a lower per-call budget skips it. */
export const KEYWORD_IDEAS_ESTIMATE_USD = SEO_COST_ESTIMATE_MICROS.keyword_ideas / 1_000_000;
