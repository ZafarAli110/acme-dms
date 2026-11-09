import { queryOptions } from "@tanstack/react-query";
import type { ListParams } from "../../../core/paging/listParams";
import type { PartQuestion } from "../types/part";
import { partQueries } from "./partQueries";
import { PART_QUERY_KEYS } from "./partQueryKey";

/**
 * Each parts query, key and fetch together, defined once: a route's clientLoader prefetches with it and the page's
 * hook reads with it, so the two can never use different keys.
 *
 * `retryOnMount: false` on each option a clientLoader fetches: the loader has had its tries (two more when busy) and runs
 * again on every visit, so the page does not start a second round when it shows (ACME-122).
 */
export const partQueryOptions = {
  list: (locationId: string, params: ListParams) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.list(locationId, params),
      queryFn: ({ signal }) => partQueries.getPartsAsync(params, { signal, locationId }),
      retryOnMount: false,
    }),
  /** How many parts the question matches, exactly: asked once per search and filter (ACME-124). */
  count: (locationId: string, question: PartQuestion) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.count(locationId, question),
      queryFn: ({ signal }) => partQueries.countPartsAsync(question, { signal, locationId }),
      retryOnMount: false,
    }),
  /**
   * Under the location's key, so a part saved there refreshes it with the list. The list's clientLoader asks for it
   * fresh on every visit to the list (ACME-124): a price saved at another counter shows the next time Parts opens.
   */
  stockValue: (locationId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.stockValue(locationId),
      queryFn: ({ signal }) => partQueries.getStockValueAsync({ signal, locationId }),
      retryOnMount: false,
    }),
  detail: (locationId: string, partId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.detail(locationId, partId),
      queryFn: ({ signal }) => partQueries.getPartAsync(partId, { signal, locationId }),
      retryOnMount: false,
    }),
};
