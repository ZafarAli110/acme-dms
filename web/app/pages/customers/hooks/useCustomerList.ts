import {useQuery} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {customerQueryOptions} from '../queries/customerQueryOptions';

/** One page of the location's customers. Prefetched by the list route's clientLoader. */
export function useCustomerList(locationId: string, params: ListParams) {
  return useQuery(customerQueryOptions.list(locationId, params));
}
