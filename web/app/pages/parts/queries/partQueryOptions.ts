import {queryOptions} from '@tanstack/react-query';
import {FIRST_PAGE, type ListParams} from '../../../core/paging/listParams';
import {partQueries} from './partQueries';
import {PART_QUERY_KEYS} from './partQueryKey';

/**
 * Each parts query, key and fetch together, defined once: a route's clientLoader prefetches with it and the page's
 * hook reads with it, so the two can never use different keys.
 */
export const partQueryOptions = {
  list: (locationId: string, params: ListParams) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.list(locationId, params),
      queryFn: ({signal}) => partQueries.getPartsAsync(params, {signal}),
    }),
  /** The first page of one: its `total` is how many parts the location stocks. */
  count: (locationId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.count(locationId),
      queryFn: ({signal}) => partQueries.getPartsAsync({...FIRST_PAGE, pageSize: 1}, {signal}),
    }),
  detail: (locationId: string, partId: string) =>
    queryOptions({
      queryKey: PART_QUERY_KEYS.detail(locationId, partId),
      queryFn: ({signal}) => partQueries.getPartAsync(partId, {signal}),
    }),
};
