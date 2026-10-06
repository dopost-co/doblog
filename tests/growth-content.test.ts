import { describe, expect, it } from "vitest";
import { buildEditorContent, contentText, currentDateNote, normalizeKeyword, slugWithoutYears, refreshStaleYears, type ArticleDraft } from "@/src/server/services/growth/content";
import { rankLinkTargets } from "@/src/server/services/growth/internal-links";

describe("growth content memory", () => {
  it("normalizes equivalent keywords for duplicate protection", () => {
    expect(normalizeKeyword("  Automatización de Redes Sociales! ")).toBe("automatizacion de redes sociales");
    expect(normalizeKeyword("automatizacion-de-redes-sociales")).toBe("automatizacion de redes sociales");
  });

  it("extracts searchable text from Editor.js without URLs and flags", () => {
    expect(contentText({ blocks: [
      { type: "header", data: { text: "A <strong>useful</strong> guide" } },
      { type: "image", data: { file: { url: "https://cdn.example/x.webp" }, caption: "Workflow diagram", stretched: false } },
    ] })).toBe("A useful guide Workflow diagram");
  });

  it("only suggests genuinely related internal links", () => {
    const ranked = rankLinkTargets({ keyword: "CRM for freelancers" }, [
      { id: "1", title: "A CRM guide for freelancers", href: "/crm", summary: "Manage client work", cluster: null, keyword: null },
      { id: "2", title: "Bread recipes", href: "/bread", summary: "Bake sourdough", cluster: null, keyword: null },
    ]);
    expect(ranked.map(item => item.id)).toEqual(["1"]);
  });
});

describe("generated Editor.js content", () => {
  it("places a useful image after its target section and sanitizes unsafe HTML", () => {
    const article: ArticleDraft = {
      title: "A complete CRM guide for freelancers",
      coverTitle: "CRM for freelancers",
      suggestedSlug: "crm-guide-freelancers",
      excerpt: "A practical guide to choosing and using a CRM as an independent professional.",
      metaTitle: "CRM guide for freelancers",
      metaDescription: "Learn how freelancers can choose and use a CRM without adding unnecessary complexity.",
      intent: "informational",
      cluster: "Freelance operations",
      secondaryKeywords: ["freelance client management"],
      introduction: ["A CRM can help <strong>independent professionals</strong> keep client work organized.<script>alert(1)</script>"],
      sections: [
        { heading: "What to track", level: 2, paragraphs: ["Track conversations, proposals and next steps in one place."], bullets: ["Contacts", "Follow-ups"] },
        { heading: "A simple workflow", level: 2, paragraphs: ["Begin with the smallest process that removes repeated admin work."], bullets: [] },
        { heading: "Choosing a tool", level: 2, paragraphs: ["Choose a system your daily routine can actually sustain."], bullets: [] },
      ],
      faqHeading: "Common questions",
      faqs: [],
      conclusionHeading: "Start small",
      conclusion: ["A focused setup is more useful than a complicated system nobody maintains."],
      coverImage: { prompt: "An organized freelance desk represented through calm editorial shapes", alt: "Organized freelance client workflow" },
      inlineImages: [],
    };
    const content = buildEditorContent(article, [{ afterHeading: "A simple workflow", url: "https://cdn.example/workflow.webp", alt: "A simple CRM workflow", caption: "A lightweight client workflow" }]);
    expect(JSON.stringify(content)).not.toContain("<script>");
    const headingIndex = content.blocks.findIndex(block => block.type === "header" && block.data.text === "A simple workflow");
    const imageIndex = content.blocks.findIndex(block => block.type === "image");
    expect(imageIndex).toBeGreaterThan(headingIndex);
  });
});

describe("Years in titles", () => {
  const now = new Date("2026-10-05T07:00:00Z");

  it("brings a recent past year up to the current one", () => {
    expect(refreshStaleYears("Las mejores herramientas para programar Instagram en 2024", now)).toBe("Las mejores herramientas para programar Instagram en 2026");
    expect(refreshStaleYears("best-tools-2025", now)).toBe("best-tools-2026");
  });

  it("keeps the current year, older history, future years and longer numbers", () => {
    expect(refreshStaleYears("Qué cambió de 2019 a 2026 y qué llega en 2027", now)).toBe("Qué cambió de 2019 a 2026 y qué llega en 2027");
    expect(refreshStaleYears("Más de 120240 usuarios", now)).toBe("Más de 120240 usuarios");
  });

  it("keeps recent years out of slugs", () => {
    expect(slugWithoutYears("comparativa-herramientas-programar-instagram-2024", now)).toBe("comparativa-herramientas-programar-instagram");
    expect(slugWithoutYears("best-tools-2026-for-teams", now)).toBe("best-tools-for-teams");
    expect(slugWithoutYears("what-changed-since-1998-and-2009", now)).toBe("what-changed-since-1998-and-2009");
    expect(slugWithoutYears("iso-27001-checklist", now)).toBe("iso-27001-checklist");
  });

  it("tells the model the date and year in the prompt itself", () => {
    expect(currentDateNote(now)).toContain("Today is 2026-10-05, so the current year is 2026.");
  });
});
