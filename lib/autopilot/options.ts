export const AUTOPILOT_PACE_OPTIONS = [
  { value: 1, label: "1 / week", help: "A gentle pace" },
  { value: 2, label: "2 / week", help: "Recommended" },
  { value: 3, label: "3 / week", help: "Steady growth" },
  { value: 5, label: "5 / week", help: "Every workday" },
  { value: 7, label: "1 / day", help: "Maximum pace" },
] as const;

export const AUTOPILOT_PUBLISHING_OPTIONS = [
  { value: "auto_publish", title: "Publish automatically", help: "Go live as soon as text and images are ready." },
  { value: "review", title: "Wait for my review", help: "Edit it before it goes live." },
] as const;

export const AUTOPILOT_AUDIENCE_OPTIONS = [
  { id: "founders", title: "Startup founders", example: "Practical advice for founders and lean teams.", value: "Startup founders and small teams looking for practical, actionable guidance." },
  { id: "marketing", title: "Marketing teams", example: "Useful strategy without empty jargon.", value: "Marketing teams who want clear strategy, useful examples and measurable next steps." },
  { id: "local-business", title: "Local businesses", example: "Simple answers for busy owners.", value: "Local business owners who need straightforward answers they can apply without specialist knowledge." },
  { id: "technical", title: "Technical buyers", example: "Precise detail for informed decisions.", value: "Technical decision-makers comparing solutions and looking for precise, evidence-led guidance." },
] as const;

export const AUTOPILOT_VOICE_OPTIONS = [
  { id: "clear-expert", title: "Clear expert", example: "Confident, precise and easy to understand.", value: "Clear and authoritative without sounding academic. Explain complex ideas plainly, use concrete examples and avoid filler." },
  { id: "friendly-guide", title: "Friendly guide", example: "Warm, helpful and conversational.", value: "Warm, conversational and encouraging. Speak directly to the reader, explain each step calmly and never patronize." },
  { id: "bold-challenger", title: "Bold challenger", example: "Direct opinions with useful reasoning.", value: "Direct, energetic and opinionated. Challenge common assumptions, support claims with reasoning and keep the language concise." },
  { id: "premium-editorial", title: "Premium editorial", example: "Polished, thoughtful and restrained.", value: "Polished, thoughtful and understated. Favor strong narrative flow, careful word choice and a calm premium feel." },
] as const;

export type AutopilotPace = typeof AUTOPILOT_PACE_OPTIONS[number]["value"];
export type AutopilotPublishingMode = typeof AUTOPILOT_PUBLISHING_OPTIONS[number]["value"];
