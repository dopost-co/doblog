import { describe, expect, it } from "vitest";
import { nextVisibleStep, resolveVisibleStep, visibleSteps } from "@/lib/onboarding/steps";

const ids = (flow: Parameters<typeof visibleSteps>[0], values: Record<string, string | string[]>) => visibleSteps(flow, values).map((step) => step.id);

describe("Onboarding steps that depend on answers", () => {
  it("asks how the blog will be used before any Autopilot question", () => {
    for (const values of [{}, { websiteSkipped: "true" }] as Record<string, string>[]) {
      const steps = ids("new-user", values);
      const firstAutopilot = steps.findIndex((id) => id.startsWith("autopilot-"));
      expect(firstAutopilot).toBeGreaterThan(-1);
      expect(steps.indexOf("content-mode")).toBeLessThan(firstAutopilot);
    }
  });

  it("skips every Autopilot question for blogs written by hand", () => {
    expect(ids("new-user", { contentMode: "manual" }).some((id) => id.startsWith("autopilot-"))).toBe(false);
    expect(nextVisibleStep("new-blog", "content-mode", { contentMode: "manual" })).toBeNull();
  });

  it("asks for a style only when that kind of image is wanted", () => {
    const withImages = ids("new-blog", { contentMode: "both" });
    expect(withImages).toContain("autopilot-thumbnail-style");
    expect(withImages).toContain("autopilot-inline-style");
    const without = ids("new-blog", { contentMode: "automatic", thumbnailEnabled: "false", inlineImagesEnabled: "false" });
    expect(without).toContain("autopilot-thumbnails");
    expect(without).not.toContain("autopilot-thumbnail-style");
    expect(without).not.toContain("autopilot-inline-style");
    expect(nextVisibleStep("new-blog", "autopilot-thumbnails", { thumbnailEnabled: "false" })?.id).toBe("autopilot-inline-images");
  });

  it("always asks the Autopilot questions when setting Autopilot up later", () => {
    expect(ids("autopilot-setup", { contentMode: "manual" })[0]).toBe("autopilot-website");
  });

  it("resumes at the next step that applies", () => {
    expect(resolveVisibleStep("new-blog", "autopilot-thumbnail-style", { thumbnailEnabled: "false" })?.id).toBe("autopilot-inline-images");
  });
});
