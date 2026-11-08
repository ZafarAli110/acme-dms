import { queryOptions } from "@tanstack/react-query";
import { locationQueries } from "./locationQueries";
import { LOCATION_QUERY_KEYS } from "./locationQueryKey";

/**
 * Each Locations-page query, key and fetch together: the route's clientLoader and the page's hooks share them.
 * `retryOnMount: false`: the loader has had its tries and runs again on every visit, so the page does not start a
 * second round when it shows (ACME-122).
 */
export const locationQueryOptions = {
  users: () =>
    queryOptions({
      queryKey: LOCATION_QUERY_KEYS.users(),
      queryFn: ({ signal }) => locationQueries.getUsersAsync({ signal }),
      retryOnMount: false,
    }),
  locations: () =>
    queryOptions({
      queryKey: LOCATION_QUERY_KEYS.locations(),
      queryFn: ({ signal }) => locationQueries.getLocationsAsync({ signal }),
      retryOnMount: false,
    }),
};
