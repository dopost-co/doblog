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
  /** Sent with the step but never shown as an input. */
  hidden?: boolean;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description?: string;
  fields: OnboardingField[];
  /** Shown only when this returns true for the answers so far (and saved ones). */
  // `flow` is a plain string: its union type is derived from the steps themselves.
  when?: (values: OnboardingValues, flow: string) => boolean;
};

const answer = (values: OnboardingValues, name: string): string | undefined => {
  const value = values[name];
  return Array.isArray(value) ? value[0] : value;
};
/** Autopilot questions are skipped for blogs whose owner only writes by hand. */
const usesAutopilot = (values: OnboardingValues, flow: string): boolean =>
  flow === "autopilot-setup" || answer(values, "contentMode") !== "manual";
const hasWebsite = (values: OnboardingValues): boolean => Boolean(answer(values, "website")?.trim());
/**
 * Set when the owner says they have no website yet, so Autopilot asks for it
 * later. Typing a website never hides the step being typed in.
 */
const skippedWebsite = (values: OnboardingValues): boolean => answer(values, "websiteSkipped") === "true";

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
    id: "blog-website",
    title: "What’s your website?",
    description: "Zenex reads it to set up your blog: who you write for, how you sound, your competitors and your image style.",
    fields: [
      { name: "website", label: "Website address", placeholder: "yourwebsite.com", maxLength: 2048 },
      { name: "websiteSkipped", label: "No website yet", maxLength: 5, hidden: true },
    ],
  },
  {
    id: "website-analysis",
    when: (values, flow) => hasWebsite(values) && (flow === "autopilot-setup" || !skippedWebsite(values)),
    title: "Getting to know your website",
    fields: [],
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
    id: "content-mode",
    title: "How will you use Zenex?",
    fields: [{ name: "contentMode", label: "How you’ll use Zenex", required: true, maxLength: 20 }],
  },
  {
    id: "autopilot-website",
    // Asked here only when the website step was skipped (or to confirm it when setting up Autopilot later).
    when: (values, flow) => flow === "autopilot-setup" || (usesAutopilot(values, flow) && skippedWebsite(values)),
    title: "What is your website?",
    description: "Autopilot needs it to find what you already cover and what to write next.",
    fields: [
      { name: "website", label: "Website address", placeholder: "https://yourwebsite.com", required: true, maxLength: 2048 },
      { name: "websiteSkipped", label: "No website yet", maxLength: 5, hidden: true },
    ],
  },
  {
    id: "autopilot-website-analysis",
    // The website given just above, when the first website question was skipped.
    when: (values, flow) => flow !== "autopilot-setup" && usesAutopilot(values, flow) && skippedWebsite(values) && hasWebsite(values),
    title: "Getting to know your website",
    fields: [],
  },
  {
    id: "autopilot-audience",
    when: usesAutopilot,
    title: "Who are you writing for?",
    description: "The more specific, the better Autopilot picks topics and explains them.",
    fields: [
      { name: "audienceChoice", label: "Audience", required: true, maxLength: 40 },
      { name: "audienceCustom", label: "Custom audience", maxLength: 2000 },
    ],
  },
  {
    id: "autopilot-voice",
    when: usesAutopilot,
    title: "How should your brand sound?",
    description: "Every article follows this. Edit it, start from a style, or learn from a competitor you like.",
    fields: [
      { name: "voiceChoice", label: "Brand voice", required: true, maxLength: 40 },
      { name: "brandVoiceCustom", label: "Custom brand voice", maxLength: 2000 },
      { name: "competitorUrl", label: "Competitor website", maxLength: 2048 },
    ],
  },
  {
    id: "autopilot-competitors",
    when: usesAutopilot,
    title: "Who are your competitors?",
    description: "Autopilot looks for the searches they win and you don’t, and never links to them.",
    fields: [{ name: "competitors", label: "Competitor", placeholder: "rival.com", maxLength: 2048, multiple: true }],
  },
  {
    id: "autopilot-thumbnails",
    when: usesAutopilot,
    title: "Should Zenex create a thumbnail for each article?",
    fields: [{ name: "thumbnailEnabled", label: "Thumbnails", required: true, maxLength: 5 }],
  },
  {
    id: "autopilot-thumbnail-style",
    when: (values, flow) => usesAutopilot(values, flow) && answer(values, "thumbnailEnabled") !== "false",
    title: "What should thumbnails look like?",
    description: "Pick a style or describe your own. Reference images help keep every thumbnail consistent.",
    fields: [
      { name: "thumbnailStyleChoice", label: "Thumbnail style", required: true, maxLength: 40 },
      { name: "thumbnailStyleCustom", label: "Custom thumbnail style", maxLength: 1000 },
      { name: "thumbnailReferences", label: "Thumbnail references", maxLength: 2048, multiple: true },
    ],
  },
  {
    id: "autopilot-inline-images",
    when: usesAutopilot,
    title: "Should articles include images?",
    description: "Up to two images inside each article, only where they help explain something.",
    fields: [{ name: "inlineImagesEnabled", label: "Images in articles", required: true, maxLength: 5 }],
  },
  {
    id: "autopilot-inline-style",
    when: (values, flow) => usesAutopilot(values, flow) && answer(values, "inlineImagesEnabled") !== "false",
    title: "What should images in articles look like?",
    description: "Pick a style or describe your own. Reference images help keep them consistent.",
    fields: [
      { name: "inlineStyleChoice", label: "Image style", required: true, maxLength: 40 },
      { name: "inlineStyleCustom", label: "Custom image style", maxLength: 1000 },
      { name: "inlineReferences", label: "Image references", maxLength: 2048, multiple: true },
    ],
  },
  {
    id: "autopilot-frequency",
    when: usesAutopilot,
    title: "Which days should Zenex write?",
    description: "One article on each day you pick.",
    fields: [
      { name: "writingDays", label: "Writing days", required: true, maxLength: 1, multiple: true },
      // Not asked: the browser's timezone, so "09:00" means the owner's morning.
      { name: "timezone", label: "Timezone", maxLength: 64, hidden: true },
    ],
  },
  {
    id: "autopilot-publishing",
    when: usesAutopilot,
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
  "new-user": ["profile", "blogs", "blog-website", "website-analysis", "blog-languages", "content-mode", "autopilot-website", "autopilot-website-analysis", "autopilot-audience", "autopilot-voice", "autopilot-competitors", "autopilot-thumbnails", "autopilot-thumbnail-style", "autopilot-inline-images", "autopilot-inline-style", "autopilot-frequency", "autopilot-publishing"],
  "new-blog": ["blogs", "blog-website", "website-analysis", "blog-languages", "content-mode", "autopilot-website", "autopilot-website-analysis", "autopilot-audience", "autopilot-voice", "autopilot-competitors", "autopilot-thumbnails", "autopilot-thumbnail-style", "autopilot-inline-images", "autopilot-inline-style", "autopilot-frequency", "autopilot-publishing"],
  "invited-user": ["profile"],
  "autopilot-setup": ["autopilot-website", "website-analysis", "autopilot-audience", "autopilot-voice", "autopilot-competitors", "autopilot-thumbnails", "autopilot-thumbnail-style", "autopilot-inline-images", "autopilot-inline-style", "autopilot-frequency", "autopilot-publishing"],
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

/** The steps of a flow that apply, given the answers so far. */
export function visibleSteps(flow: OnboardingFlowId, values: OnboardingValues): OnboardingStep[] {
  return flowSteps(flow).filter((step: OnboardingStep) => !step.when || step.when(values, flow));
}

/** The next step to show after `stepId`, or null when the flow is finished. */
export function nextVisibleStep(flow: OnboardingFlowId, stepId: string, values: OnboardingValues) {
  const order = ONBOARDING_FLOWS[flow] as readonly string[];
  const position = order.indexOf(stepId);
  return visibleSteps(flow, values).find((step) => order.indexOf(step.id) > position) ?? null;
}

/** `stepId` if it applies, otherwise the next step that does (for resuming). */
export function resolveVisibleStep(flow: OnboardingFlowId, stepId: string | null | undefined, values: OnboardingValues) {
  const steps = visibleSteps(flow, values);
  const order = ONBOARDING_FLOWS[flow] as readonly string[];
  const position = order.indexOf(stepId ?? "");
  return steps.find((step) => order.indexOf(step.id) >= position) ?? steps[steps.length - 1] ?? null;
}
