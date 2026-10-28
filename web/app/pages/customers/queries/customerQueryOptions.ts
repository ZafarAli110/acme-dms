import {queryOptions} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {customerQueries} from './customerQueries';
import {CUSTOMER_QUERY_KEYS} from './customerQueryKey';

/**
 * Each customers query, key and fetch together, defined once: a route's clientLoader prefetches with it and the
 * page's hook reads with it, so the two can never use different keys.
 */
export const customerQueryOptions = {
  list: (locationId: string, {search, page, pageSize}: ListParams) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.list(locationId, search, page, pageSize),
      queryFn: ({signal}) => customerQueries.getCustomersAsync(search, page, pageSize, {signal}),
    }),
  /** The first page of one: its `total` is how many customers the location has. */
  count: (locationId: string) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.count(locationId),
      queryFn: ({signal}) => customerQueries.getCustomersAsync('', 1, 1, {signal}),
    }),
  recent: (locationId: string) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.recent(locationId),
      queryFn: ({signal}) => customerQueries.getRecentCustomersAsync({signal}),
    }),
  detail: (locationId: string, customerId: string) =>
    queryOptions({
      queryKey: CUSTOMER_QUERY_KEYS.detail(locationId, customerId),
      queryFn: ({signal}) => customerQueries.getCustomerAsync(customerId, {signal}),
    }),
};
