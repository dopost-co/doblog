import { isValidLanguageCode } from "@/lib/languages";

export const MAX_BLOG_LANGUAGES = 10;

/**
 * Cleans the languages a blog is written in: known ISO 639-1 codes, no
 * duplicates, order kept (the first one is the main language).
 */
export function normalizeBlogLanguages(input: readonly string[]) {
  const languages = [...new Set(input.map((code) => code.trim().toLowerCase()).filter(Boolean))];
  const invalid = languages.find((code) => !isValidLanguageCode(code));
  if (invalid) throw new Error(`Unknown language: ${invalid}`);
  if (languages.length === 0) throw new Error("Choose at least one language");
  if (languages.length > MAX_BLOG_LANGUAGES) throw new Error(`Choose up to ${MAX_BLOG_LANGUAGES} languages`);
  return languages;
}

/** Languages of the blog that a translation group does not cover yet. */
export function missingLanguages(blogLanguages: readonly string[], groupLanguages: readonly string[]) {
  const covered = new Set(groupLanguages);
  return blogLanguages.filter((code) => !covered.has(code));
}
