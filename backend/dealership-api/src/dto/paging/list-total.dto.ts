/**
 * How many rows a list's search and filter match, as the footer shows it (ACME-129): `exact` when every match fits on
 * one page of the most a page can hold (100), `about` from the database's statistics for the whole list or a status
 * filter ("about 960,000"), and `many` otherwise ("1–25 of many"), never a number that could be far off.
 */
export type ListTotalDto =
  { kind: "exact"; value: number } | { kind: "about"; value: number } | { kind: "many"; value: null };

/** Up to this many matches are counted exactly: the most one page can show. */
export const MAX_EXACT_TOTAL = 100;
