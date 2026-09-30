/**
 * Onboarding steps. To add a step, add an entry here, list it in the flows
 * that should show it (ONBOARDING_FLOWS) and, if it saves anything, add a
 * handler with the same id in src/server/services/onboarding/actions.ts.
 */
export type OnboardingField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  /** Lets the user add several values, e.g. more than one blog. */
  multiple?: boolean;
  addLabel?: string;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description?: string;
  fields: OnboardingField[];
};

export const ONBOARDING_STEPS = [
  {
    id: "profile",
    title: "What’s your name?",
    fields: [{ name: "name", label: "Name", placeholder: "Jane Doe", required: true, maxLength: 80 }],
  },
  {
    id: "blogs",
    title: "Name your blog",
    description: "You can add more later.",
    fields: [{ name: "blogs", label: "Blog name", placeholder: "My blog", required: true, maxLength: 120 }],
  },
  {
    id: "blog-languages",
    title: "Which languages is your blog in?",
    description: "The first one is the main language. You can change this later in Settings.",
    fields: [
      { name: "languages", label: "Languages", required: true, maxLength: 5, multiple: true },
      { name: "autoSyncTranslations", label: "Translate automatically", maxLength: 5 },
    ],
  },
  {
    id: "autopilot-website",
    title: "What is your website?",
    description: "Zenex will find its sitemap and understand what you already cover.",
    fields: [{ name: "website", label: "Website address", placeholder: "https://yourwebsite.com", required: true, maxLength: 2048 }],
  },
  {
    id: "autopilot-audience",
    title: "Who are you writing for?",
    description: "Choose the closest audience. You can make it more specific later.",
    fields: [
      { name: "audienceChoice", label: "Audience", required: true, maxLength: 40 },
      { name: "audienceCustom", label: "Custom audience", maxLength: 2000 },
    ],
  },
  {
    id: "autopilot-voice",
    title: "How should your brand sound?",
    description: "Start from a style, write your own, or learn from a competitor you like.",
    fields: [
      { name: "voiceChoice", label: "Brand voice", required: true, maxLength: 40 },
      { name: "brandVoiceCustom", label: "Custom brand voice", maxLength: 2000 },
      { name: "competitorUrl", label: "Competitor website", maxLength: 2048 },
    ],
  },
  {
    id: "autopilot-frequency",
    title: "How often should Zenex write?",
    description: "Each article will receive an exact generation date.",
    fields: [{ name: "draftsPerWeek", label: "Writing frequency", required: true, maxLength: 1 }],
  },
  {
    id: "autopilot-publishing",
    title: "What happens when an article is ready?",
    description: "You can change this later from Autopilot.",
    fields: [{ name: "publishingMode", label: "Publishing mode", required: true, maxLength: 20 }],
  },
] as const satisfies readonly OnboardingStep[];

export type OnboardingStepId = typeof ONBOARDING_STEPS[number]["id"];
export type OnboardingValues = Record<string, string | string[]>;

/**
 * Which steps each kind of onboarding shows, in order.
 * - new-user: someone who signed up on their own; sets up their profile and first blog.
 * - new-blog: an existing user adding another blog (same setup, without the profile).
 * - invited-user: someone invited to an existing blog; only needs their name.
 * - autopilot-setup: a blog created before onboarding asked about Autopilot.
 */
export const ONBOARDING_FLOWS = {
  "new-user": ["profile", "blogs", "blog-languages", "autopilot-website", "autopilot-audience", "autopilot-voice", "autopilot-frequency", "autopilot-publishing"],
  "new-blog": ["blogs", "blog-languages", "autopilot-website", "autopilot-audience", "autopilot-voice", "autopilot-frequency", "autopilot-publishing"],
  "invited-user": ["profile"],
  "autopilot-setup": ["autopilot-website", "autopilot-audience", "autopilot-voice", "autopilot-frequency", "autopilot-publishing"],
} as const satisfies Record<string, readonly OnboardingStepId[]>;

export type OnboardingFlowId = keyof typeof ONBOARDING_FLOWS;

/** Flows that set up one blog and leave the user's own onboarding untouched. */
export const BLOG_FLOWS: readonly OnboardingFlowId[] = ["new-blog", "autopilot-setup"];

export function isOnboardingFlow(value: unknown): value is OnboardingFlowId {
  return typeof value === "string" && Object.hasOwn(ONBOARDING_FLOWS, value);
}

export function flowSteps(flow: OnboardingFlowId) {
  return ONBOARDING_FLOWS[flow].map((id) => ONBOARDING_STEPS.find((step) => step.id === id)!);
}

/** Position of a step in a flow; unknown steps start the flow from the beginning. */
export function stepIndex(flow: OnboardingFlowId, id: string | null | undefined) {
  const index = (ONBOARDING_FLOWS[flow] as readonly string[]).indexOf(id ?? "");
  return index === -1 ? 0 : index;
}
