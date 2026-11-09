/**
 * How many rows a list's search and filter match, as the API says it (ACME-129): `exact`; `about`, from the database's
 * statistics, for a big whole list; `many` when a search or a filter matches more than a page can show.
 */
export type ListTotal =
  { kind: "exact"; value: number } | { kind: "about"; value: number } | { kind: "many"; value: null };
