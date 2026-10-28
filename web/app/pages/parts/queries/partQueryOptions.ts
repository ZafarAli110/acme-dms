import {queryOptions} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {partQueries} from './partQueries';
import {PART_QUERY_KEYS} from './partQueryKey';

/**
 * Each parts query, key and fetch together, defined once: a route's clientLoader prefetches with it and the page's
 * hook reads with it, so the two can never use different keys.
 */
export const partQueryOptions = {
  list: (locationId: string, {search, page, pageSize}: ListParams) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.list(locationId, search, page, pageSize),
      queryFn: ({signal}) => partQueries.getPartsAsync(search, page, pageSize, {signal}),
    }),
  /** The first page of one: its `total` is how many parts the location stocks. */
  count: (locationId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.count(locationId),
      queryFn: ({signal}) => partQueries.getPartsAsync('', 1, 1, {signal}),
    }),
  detail: (locationId: string, partId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.detail(locationId, partId),
      queryFn: ({signal}) => partQueries.getPartAsync(partId, {signal}),
    }),
};
