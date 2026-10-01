/**
 * The headline drawn on a brand thumbnail. It is deliberately not the article
 * title: a cover has room for a few words, and a full SEO title only fits by
 * shrinking until it is unreadable or cutting with an ellipsis.
 *
 * It is always written by the model, never derived from the title by rule. The
 * blog writes in any language, so there is no word list, no "drop the trailing
 * preposition" and no slicing here: those only ever work for the languages they
 * were written for, and read as broken in the rest.
 */

/** What the cover can draw at a readable size, and what the model is asked for. */
export const COVER_TITLE_MIN_WORDS = 3;
export const COVER_TITLE_MAX_WORDS = 5;
export const COVER_TITLE_MAX_CHARS = 60;

/** A stored headline, trimmed and bounded, or null when there is none to draw. */
export function storedCoverTitle(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, COVER_TITLE_MAX_CHARS) : null;
}

/** Word count as the model is asked to count: whitespace-separated tokens. */
export function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
