import { describe, expect, it } from "vitest";
import { missingAutopilotStep } from "@/lib/autopilot/setup";
import { BLOG_FLOWS, ONBOARDING_FLOWS } from "@/lib/onboarding/steps";

describe("Autopilot setup", () => {
  const complete = { targetDomain: "example.com", audience: "Founders", brandVoice: "Clear" };

  it("sends blogs without Autopilot answers to the first missing step", () => {
    expect(missingAutopilotStep(null)).toBe("autopilot-website");
    expect(missingAutopilotStep({ ...complete, targetDomain: null })).toBe("autopilot-website");
    expect(missingAutopilotStep({ ...complete, audience: null })).toBe("autopilot-audience");
    expect(missingAutopilotStep({ ...complete, brandVoice: null })).toBe("autopilot-voice");
  });

  it("treats a blog with every answer as set up", () => {
    expect(missingAutopilotStep(complete)).toBeNull();
  });

  it("asks only the Autopilot questions and leaves the user's onboarding alone", () => {
    expect(ONBOARDING_FLOWS["autopilot-setup"].every((step) => step.startsWith("autopilot-"))).toBe(true);
    expect(BLOG_FLOWS).toContain("autopilot-setup");
  });
});
