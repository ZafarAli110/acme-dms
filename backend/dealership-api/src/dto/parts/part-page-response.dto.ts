import type { PartListItemDto } from "./part-list-item.dto";

/**
 * A page of the parts list. It says whether another page follows, not how many parts there are: the total is the count
 * endpoint's (`GET /v1/parts/count`), fetched once per search and filter instead of on every page (ACME-124).
 */
export interface PartPageResponseDto {
  items: PartListItemDto[];
  page: number;
  pageSize: number;
  /** Another page follows this one. */
  hasMore: boolean;
}
