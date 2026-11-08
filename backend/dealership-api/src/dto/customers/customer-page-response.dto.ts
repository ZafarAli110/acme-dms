import type { CustomerListItemDto } from "./customer-list-item.dto";

/**
 * A page of the customer list. It says whether another page follows, not how many customers there are: the total is
 * the count endpoint's (`GET /v1/customers/count`), fetched once per search and filter instead of on every page
 * (ACME-117).
 */
export interface CustomerPageResponseDto {
  items: CustomerListItemDto[];
  page: number;
  pageSize: number;
  /** Another page follows this one (and lies within the list's depth). */
  hasMore: boolean;
}
