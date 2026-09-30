/** The Autopilot answers a blog needs before it can run (asked in onboarding). */
type AutopilotSettings = { targetDomain: string | null; audience: string | null; brandVoice: string | null } | null | undefined;

/**
 * The first onboarding step whose answer is missing, or null once Autopilot is
 * set up. Blogs created before onboarding asked these questions start here.
 */
export function missingAutopilotStep(settings: AutopilotSettings) {
  if (!settings?.targetDomain) return "autopilot-website" as const;
  if (!settings.audience) return "autopilot-audience" as const;
  if (!settings.brandVoice) return "autopilot-voice" as const;
  return null;
}
