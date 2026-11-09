import type { PartListItemDto } from "./part-list-item.dto";

/**
 * A page of the parts list. It says whether another page follows, not how many parts there are: the total is the count
 * endpoint's (`GET /v1/parts/count`), fetched once per search and filter instead of on every page (ACME-124).
 */
export interface PartPageResponseDto {
  items: PartListItemDto[];
  /** The page's number when it was asked for by number; null for a page found by a cursor or the last page. */
  page: number | null;
  pageSize: number;
  /** Another page follows this one. */
  hasMore: boolean;
  /** Send as `after` for the next page; null on the last page, and for a search, which pages by number (ACME-129). */
  next: string | null;
  /** Send as `before` for the page before; null on the first page, and for a search. */
  previous: string | null;
}
