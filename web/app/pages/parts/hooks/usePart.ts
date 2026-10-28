import {useQuery} from '@tanstack/react-query';
import {partQueryOptions} from '../queries/partQueryOptions';

/** A part as stocked at the selected location. Polls while a photo is still being processed. */
export function usePart(locationId: string, partId: string) {
  return useQuery({
    ...partQueryOptions.detail(locationId, partId),
    refetchInterval: (query) => (query.state.data?.photos.some((photo) => photo.status === 'pending') ? 2000 : false),
  });
}
