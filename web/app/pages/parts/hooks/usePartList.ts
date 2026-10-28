import {useQuery} from '@tanstack/react-query';
import type {ListParams} from '../../../core/paging/listParams';
import {partQueries} from '../queries/partQueries';
import {PART_QUERY_KEYS} from '../queries/partQueryKey';

/** One page of the parts stocked at the location. Prefetched by the list route's clientLoader with the same key. */
export function usePartList(locationId: string, {search, page, pageSize}: ListParams) {
  return useQuery({
    queryKey: PART_QUERY_KEYS.list(locationId, search, page, pageSize),
    queryFn: ({signal}) => partQueries.getPartsAsync(search, page, pageSize, {signal}),
  });
}
