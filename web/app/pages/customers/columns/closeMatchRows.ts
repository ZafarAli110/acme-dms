import type { CustomerPageItem } from "../types/customer";

/** A row of the grid that is not a customer (ACME-120, design a.html): the note, or the "Did you mean" divider. */
export interface MatchRow {
  id: string;
  kind: "note" | "divider";
}

export type CustomerGridRow = CustomerPageItem | MatchRow;

export function isMatchRow(row: CustomerGridRow): row is MatchRow {
  return "kind" in row;
}

/**
 * The page's customers as the grid shows them: the exact matches, then a "Did you mean" divider before the first close
 * spelling; when nothing matched exactly, a note first ('No customers are called "penwod".').
 */
export function withCloseMatchRows(items: CustomerPageItem[]): CustomerGridRow[] {
  const firstClose = items.findIndex((item) => item.match === "close");
  if (firstClose < 0) {
    return items;
  }
  const exact = items.slice(0, firstClose);
  const note: MatchRow[] = exact.length === 0 ? [{ id: "match-note", kind: "note" }] : [];
  return [...note, ...exact, { id: "match-divider", kind: "divider" }, ...items.slice(firstClose)];
}
