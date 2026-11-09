import type { CustomerListItemDto } from "./customer-list-item.dto";

/**
 * A page of the customer list. It says whether another page follows, not how many customers there are: the total is
 * the count endpoint's (`GET /v1/customers/count`), fetched once per search and filter instead of on every page
 * (ACME-117).
 */
/**
 * A customer on a page of the list, and how it matched the search: `exact` as today, or `close`, a spelling a little
 * different from what was typed, shown after the exact ones under "Did you mean" (ACME-120).
 */
export interface CustomerPageItemDto extends CustomerListItemDto {
  match: "exact" | "close";
}

export interface CustomerPageResponseDto {
  items: CustomerPageItemDto[];
  /** The page's number when it was asked for by number; null for a page found by a cursor or the last page. */
  page: number | null;
  pageSize: number;
  /** Another page follows this one. */
  hasMore: boolean;
  /** Send as `after` for the next page; null on the last page (ACME-129). */
  next: string | null;
  /** Send as `before` for the page before; null on the first page. */
  previous: string | null;
}
