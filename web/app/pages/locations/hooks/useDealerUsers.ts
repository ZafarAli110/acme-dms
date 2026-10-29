import {useQuery} from '@tanstack/react-query';
import {locationQueryOptions} from '../queries/locationQueryOptions';

/** Everyone at the dealer and where they work. Prefetched by the route's clientLoader. */
export function useDealerUsers() {
  return useQuery(locationQueryOptions.users());
}
