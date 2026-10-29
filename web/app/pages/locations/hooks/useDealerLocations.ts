import {useQuery} from '@tanstack/react-query';
import {locationQueryOptions} from '../queries/locationQueryOptions';

/** The dealer's locations: one column each. Prefetched by the route's clientLoader. */
export function useDealerLocations() {
  return useQuery(locationQueryOptions.locations());
}
