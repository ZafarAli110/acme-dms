import {useQuery} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {partQueryOptions} from '../queries/partQueryOptions';

/** One page of the parts stocked at the location. Prefetched by the list route's clientLoader. */
export function usePartList(locationId: string, params: ListParams) {
  return useQuery(partQueryOptions.list(locationId, params));
}
