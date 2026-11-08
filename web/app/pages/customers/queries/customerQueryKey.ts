import type { ListParams } from "../../../core/paging/listParams";
import type { CustomerQuestion } from "../types/customer";

/** Query keys for customers. Customers belong to a location, so every key starts with the location id. */
export const CUSTOMER_QUERY_KEYS = {
  all: (locationId: string) => ["customers", locationId] as const,
  list: (locationId: string, params: ListParams) => ["customers", locationId, "list", params] as const,
  /** A total per question (search and filter), kept while the pages and the sort change (ACME-117). */
  count: (locationId: string, question: CustomerQuestion) => ["customers", locationId, "count", question] as const,
  recent: (locationId: string) => ["customers", locationId, "recent"] as const,
  detail: (locationId: string, customerId: string) => ["customers", locationId, "detail", customerId] as const,
} as const;
