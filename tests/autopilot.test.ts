import { describe, expect, it } from "vitest";
import { competitorVoiceSchema } from "@/src/server/services/growth/brand";
import { discoverySettingsSchema, normalizeWebsite } from "@/src/server/services/growth/discovery";

describe("Autopilot settings", () => {
  const settings = {
    website: "https://example.com",
    frequency: "weekly" as const,
    topicsPerRun: 8,
    draftsPerWeek: 2,
    publishingMode: "auto_publish" as const,
  };

  it("requires an automatic writing pace", () => {
    expect(discoverySettingsSchema.safeParse(settings).success).toBe(true);
    expect(discoverySettingsSchema.safeParse({ ...settings, draftsPerWeek: 0 }).success).toBe(false);
  });

  it("normalizes a public website to its hostname", () => {
    expect(normalizeWebsite("https://www.Example.com/articles")).toBe("www.example.com");
    expect(() => normalizeWebsite("http://localhost:3000")).toThrow();
  });
});

describe("competitor voice output", () => {
  it("accepts a complete typed voice profile", () => {
    expect(competitorVoiceSchema.safeParse({
      voice: "Write with calm confidence, short explanations and concrete examples for every important claim.",
      traits: ["calm", "precise", "practical"],
      avoid: ["empty hype", "copied slogans"],
    }).success).toBe(true);
  });

  it("rejects incomplete model output", () => {
    expect(competitorVoiceSchema.safeParse({ voice: "Friendly" }).success).toBe(false);
  });
});
