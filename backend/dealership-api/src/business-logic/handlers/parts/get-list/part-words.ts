/** A word of the search: letters (any language) and digits. Everything else separates words. */
const WORD = /[\p{L}\p{N}]+/gu;

/**
 * The search as a `to_tsquery` (ACME-123): every word must be in the part's description, each as the beginning of a word
 * ("brak pads" finds "Brake pad set"), in any order; the "english" configuration given with it adds the word forms
 * ("pads" finds "pad") and drops the small words ("for", "the"). Only words reach the query, each quoted, so a quote, an
 * operator (`&`, `|`, `!`, `<->`) or a wildcard in the search is never query syntax. Null when the search has no words.
 */
export function toPartWordsQuery(search: string): string | null {
  const words = search.match(WORD) ?? [];
  return words.length === 0 ? null : words.map((word) => `'${word}':*`).join(" & ");
}
