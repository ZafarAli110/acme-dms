import {useQuery} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {customerQueries} from '../queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from '../queries/customerQueryKey';

/** One page of the location's customers. Prefetched by the list route's clientLoader with the same key. */
export function useCustomerList(locationId: string, {search, page, pageSize}: ListParams) {
  return useQuery({
    queryKey: CUSTOMER_QUERY_KEYS.list(locationId, search, page, pageSize),
    queryFn: ({signal}) => customerQueries.getCustomersAsync(search, page, pageSize, {signal}),
  });
}
