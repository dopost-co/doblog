/** Google markets for SEO research, as DataForSEO location codes. */
export const SEARCH_MARKETS = [
  { code: 2840, name: "United States" },
  { code: 2826, name: "United Kingdom" },
  { code: 2124, name: "Canada" },
  { code: 2036, name: "Australia" },
  { code: 2372, name: "Ireland" },
  { code: 2356, name: "India" },
  { code: 2724, name: "Spain" },
  { code: 2484, name: "Mexico" },
  { code: 2032, name: "Argentina" },
  { code: 2170, name: "Colombia" },
  { code: 2152, name: "Chile" },
  { code: 2604, name: "Peru" },
  { code: 2250, name: "France" },
  { code: 2056, name: "Belgium" },
  { code: 2756, name: "Switzerland" },
  { code: 2276, name: "Germany" },
  { code: 2040, name: "Austria" },
  { code: 2380, name: "Italy" },
  { code: 2620, name: "Portugal" },
  { code: 2076, name: "Brazil" },
  { code: 2528, name: "Netherlands" },
  { code: 2616, name: "Poland" },
  { code: 2752, name: "Sweden" },
] as const;

/** The location every blog starts with before anyone picks a market. */
export const DEFAULT_SEARCH_MARKET = 2840;

const MARKET_BY_LANGUAGE: Record<string, number> = {
  en: 2840, es: 2724, fr: 2250, de: 2276, it: 2380, pt: 2076, nl: 2528, pl: 2616, sv: 2752,
};

/** The main market for a language, so research in Spanish is not measured on US searches. */
export function defaultSearchMarket(language: string) {
  return MARKET_BY_LANGUAGE[language.slice(0, 2).toLowerCase()] ?? DEFAULT_SEARCH_MARKET;
}
