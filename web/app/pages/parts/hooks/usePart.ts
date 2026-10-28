import {useQuery} from '@tanstack/react-query';
import {partQueries} from '../queries/partQueries';
import {PART_QUERY_KEYS} from '../queries/partQueryKey';

/** A part as stocked at the selected location. Polls while a photo is still being processed. */
export function usePart(locationId: string, partId: string) {
  return useQuery({
    queryKey: PART_QUERY_KEYS.detail(locationId, partId),
    queryFn: ({signal}) => partQueries.getPartAsync(partId, {signal}),
    refetchInterval: (query) => (query.state.data?.photos.some((photo) => photo.status === 'pending') ? 2000 : false),
  });
}
