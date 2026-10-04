/** Stages of the website analysis in onboarding, in the order they start. */
export const ANALYSIS_STAGES = [
  { id: "read", label: "Reading your website" },
  { id: "sitemap", label: "Mapping your pages" },
  { id: "understand", label: "Understanding your business and audience" },
  { id: "competitors", label: "Searching the web for competitors" },
  { id: "visual", label: "Studying your images and colors" },
] as const;

export type AnalysisStageId = typeof ANALYSIS_STAGES[number]["id"];
export type AnalysisEvent = { stage: AnalysisStageId; status: "running" | "done" | "failed"; detail?: string };

export type SiteAnalysis = {
  domain: string;
  summary: string | null;
  /** Main language of the site's copy, when it is one the blog can use. */
  language: string | null;
  audience: string | null;
  brandVoice: string | null;
  topics: string[];
  competitors: Array<{ domain: string; reason: string }>;
  thumbnailStyle: string | null;
  inlineImageStyle: string | null;
  colors: string[];
  /** The site's images the visual style was learned from. */
  images: string[];
  pages: number;
};

/** One line of the analysis stream. */
export type AnalysisMessage =
  | ({ type: "stage" } & AnalysisEvent)
  | { type: "result"; analysis: SiteAnalysis }
  | { type: "error"; error: string };
