import {queryOptions} from '@tanstack/react-query';
import {locationQueries} from './locationQueries';
import {LOCATION_QUERY_KEYS} from './locationQueryKey';

/** Each Locations-page query, key and fetch together: the route's clientLoader and the page's hooks share them. */
export const locationQueryOptions = {
  users: () =>
    queryOptions({
      queryKey: LOCATION_QUERY_KEYS.users(),
      queryFn: ({signal}) => locationQueries.getUsersAsync({signal}),
    }),
  locations: () =>
    queryOptions({
      queryKey: LOCATION_QUERY_KEYS.locations(),
      queryFn: ({signal}) => locationQueries.getLocationsAsync({signal}),
    }),
};
