import { describe, expect, it } from "vitest";
import { visibleSteps } from "@/lib/onboarding/steps";
import { homepageFacts } from "@/src/server/services/onboarding/site-analysis";

const ids = (values: Record<string, string | string[]>, flow: "new-blog" | "autopilot-setup" = "new-blog") => visibleSteps(flow, values).map((step) => step.id);

describe("Website in onboarding", () => {
  it("analyzes the website right after it is given and does not ask for it again", () => {
    const steps = ids({ website: "dopost.co", contentMode: "automatic" });
    expect(steps).toContain("website-analysis");
    expect(steps).not.toContain("autopilot-website");
    expect(steps).toContain("autopilot-competitors");
  });

  it("skipping the website skips the analysis and asks for it before Autopilot", () => {
    const steps = ids({ website: "", websiteSkipped: "true", contentMode: "automatic" });
    expect(steps).not.toContain("website-analysis");
    expect(steps).toContain("autopilot-website");
    expect(steps).not.toContain("autopilot-website-analysis");
  });

  it("keeps the late website step while typing in it, and analyzes what was typed", () => {
    const steps = ids({ website: "yeclajob.com", websiteSkipped: "true", contentMode: "automatic" });
    expect(steps).toContain("autopilot-website");
    expect(steps).toContain("autopilot-website-analysis");
    expect(steps).not.toContain("website-analysis");
  });

  it("writing by hand asks nothing about Autopilot", () => {
    const steps = ids({ website: "", websiteSkipped: "true", contentMode: "manual" });
    expect(steps.filter((id) => id.startsWith("autopilot-"))).toEqual([]);
  });

  it("setting up Autopilot later confirms the website and analyzes it", () => {
    expect(ids({ website: "dopost.co", websiteSkipped: "false" }, "autopilot-setup").slice(0, 2)).toEqual(["autopilot-website", "website-analysis"]);
    // A blog with no website saved yet is marked as skipped; setting up Autopilot still analyzes it.
    expect(ids({ website: "dopost.co", websiteSkipped: "true" }, "autopilot-setup").slice(0, 2)).toEqual(["autopilot-website", "website-analysis"]);
  });
});

describe("Homepage facts", () => {
  const html = `<!doctype html><html lang="es-ES"><head><title>Dopost &amp; co</title>
    <meta name="description" content="Programa tus redes">
    <meta property="og:image" content="/og.png"><meta name="theme-color" content="#86198f">
    <style>.a{color:#075985}.b{color:#075985}.c{background:#ffffff}</style></head>
    <body><h1>Publica en <b>todas</b> tus redes</h1><img src="https://cdn.example.com/hero.webp" width="800">
    <img src="/icon.svg"><img src="/tiny.png" width="32"><img src="http://insecure.example.com/a.jpg"></body></html>`;
  const facts = homepageFacts(html, new URL("https://dopost.co/"));

  it("reads title, description, language and headings", () => {
    expect(facts.title).toBe("Dopost & co");
    expect(facts.description).toBe("Programa tus redes");
    expect(facts.language).toBe("es");
    expect(facts.headings).toEqual(["Publica en todas tus redes"]);
  });

  it("keeps only real HTTPS images and brand colors", () => {
    expect(facts.images).toEqual(["https://dopost.co/og.png", "https://cdn.example.com/hero.webp"]);
    expect(facts.themeColor).toBe("#86198f");
    expect(facts.colors).toEqual(["#075985"]);
  });
});
