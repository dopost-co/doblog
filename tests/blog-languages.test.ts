import { describe, expect, it } from "vitest";
import { missingLanguages, normalizeBlogLanguages } from "@/lib/blog-languages";
import { translatableTextChanged } from "@/src/server/services/translations/post-translation";
import { ONBOARDING_FLOWS } from "@/lib/onboarding/steps";

describe("Blog languages", () => {
  it("keeps order, removes duplicates and normalizes case", () => {
    expect(normalizeBlogLanguages([" ES", "en", "es", ""])).toEqual(["es", "en"]);
  });

  it("rejects unknown or empty language lists", () => {
    expect(() => normalizeBlogLanguages(["xx"])).toThrow("Unknown language: xx");
    expect(() => normalizeBlogLanguages([])).toThrow("Choose at least one language");
  });

  it("lists the blog languages a translation group lacks", () => {
    expect(missingLanguages(["en", "es", "it"], ["es"])).toEqual(["en", "it"]);
    expect(missingLanguages(["en"], ["en", "fr"])).toEqual([]);
  });

  it("is asked right after naming a blog", () => {
    for (const flow of ["new-user", "new-blog"] as const) {
      const steps: readonly string[] = ONBOARDING_FLOWS[flow];
      expect(steps[steps.indexOf("blogs") + 1]).toBe("blog-languages");
    }
    expect(ONBOARDING_FLOWS["invited-user"]).not.toContain("blog-languages");
  });
});

describe("Translatable text changes", () => {
  const post = {
    title: "Hello", coverTitle: null, excerpt: null, metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null, keywords: null,
    content: { time: 1, blocks: [{ type: "paragraph", data: { text: "Hi" } }] },
  };

  it("ignores Editor.js save timestamps", () => {
    expect(translatableTextChanged(post, { ...post, content: { ...post.content, time: 2 } })).toBe(false);
  });

  it("detects edited text and content", () => {
    expect(translatableTextChanged(post, { ...post, title: "Hello!" })).toBe(true);
    expect(translatableTextChanged(post, { ...post, content: { time: 1, blocks: [] } })).toBe(true);
  });
});
