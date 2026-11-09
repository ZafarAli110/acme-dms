/**
 * How many rows a list's search and filter match, as the footer shows it (ACME-129): `exact` when every match fits on
 * the first page, `about` from the database's statistics for the whole list or a status filter ("about 960,000"), and
 * `many` otherwise ("1–25 of many"), never a number that could be far off.
 */
export type ListTotalDto =
  { kind: "exact"; value: number } | { kind: "about"; value: number } | { kind: "many"; value: null };

/** A page's size when the request names none. */
export const DEFAULT_PAGE_SIZE = 25;

/** Up to this many matches are counted exactly: as many as the first page shows (the ticket's rule, ACME-129). */
export function mostCountedExactly(query: { pageSize?: number }): number {
  return query.pageSize ?? DEFAULT_PAGE_SIZE;
}
