import { queryOptions } from "@tanstack/react-query";
import type { ListParams } from "../../../core/paging/listParams";
import type { CustomerQuestion } from "../types/customer";
import { customerQueries } from "./customerQueries";
import { CUSTOMER_QUERY_KEYS } from "./customerQueryKey";

/**
 * Each customers query, key and fetch together, defined once: a route's clientLoader prefetches with it and the
 * page's hook reads with it, so the two can never use different keys.
 */
export const customerQueryOptions = {
  list: (locationId: string, params: ListParams) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.list(locationId, params),
      queryFn: ({ signal }) => customerQueries.getCustomersAsync(params, { signal, locationId }),
    }),
  /** How many customers a question matches, asked once per question rather than with every page (ACME-117). */
  count: (locationId: string, question: CustomerQuestion) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.count(locationId, question),
      queryFn: ({ signal }) => customerQueries.countCustomersAsync(question, { signal, locationId }),
    }),
  recent: (locationId: string) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.recent(locationId),
      queryFn: ({ signal }) => customerQueries.getRecentCustomersAsync({ signal, locationId }),
    }),
  detail: (locationId: string, customerId: string) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.detail(locationId, customerId),
      queryFn: ({ signal }) => customerQueries.getCustomerAsync(customerId, { signal, locationId }),
    }),
};
