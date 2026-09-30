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

/** How the owner uses a blog; "manual" skips the Autopilot questions in onboarding. */
export const CONTENT_MODE_OPTIONS = [
  { id: "manual", title: "I’ll write posts myself", example: "Use Zenex as your editor and CMS." },
  { id: "automatic", title: "Create posts automatically", example: "Autopilot finds topics, writes and publishes." },
  { id: "both", title: "Both", example: "Write your own and let Autopilot fill the gaps." },
] as const;

export const THUMBNAIL_STYLE_OPTIONS = [
  { id: "editorial-illustration", title: "Editorial illustration", example: "Flat shapes, calm colors, magazine feel.", value: "Clean editorial illustration with flat shapes, a calm limited palette and generous negative space." },
  { id: "photographic", title: "Photographic", example: "Natural light, realistic scenes.", value: "Realistic editorial photography with natural light, shallow depth of field and an authentic, unstaged feel." },
  { id: "3d-render", title: "Soft 3D", example: "Rounded objects, soft shadows.", value: "Soft 3D render with rounded objects, matte materials, gentle shadows and a pastel palette." },
  { id: "bold-graphic", title: "Bold graphic", example: "Strong color blocks and contrast.", value: "Bold graphic poster style with strong color blocks, high contrast and simple geometric forms." },
] as const;

export const INLINE_IMAGE_STYLE_OPTIONS = [
  { id: "diagram", title: "Simple diagrams", example: "Explain ideas with clear visuals.", value: "Simple explanatory diagram with clean lines, a few simple unlabeled shapes and a restrained palette." },
  { id: "editorial-illustration", title: "Editorial illustration", example: "Match a magazine-like look.", value: "Clean editorial illustration with flat shapes, a calm limited palette and generous negative space." },
  { id: "photographic", title: "Photographic", example: "Realistic scenes that show the topic.", value: "Realistic editorial photography with natural light and an authentic, unstaged feel." },
  { id: "sketch", title: "Hand-drawn sketch", example: "Friendly, notebook-like drawings.", value: "Hand-drawn sketch style with loose ink lines, light watercolor accents and a friendly notebook feel." },
] as const;

export type AutopilotPublishingMode = typeof AUTOPILOT_PUBLISHING_OPTIONS[number]["value"];
