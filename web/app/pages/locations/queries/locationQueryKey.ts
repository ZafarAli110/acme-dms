/** Query keys for the Locations page. Users and locations belong to the dealer, not to one location. */
export const LOCATION_QUERY_KEYS = {
  all: () => ['dealer-users'] as const,
  users: () => ['dealer-users', 'users'] as const,
  locations: () => ['dealer-users', 'locations'] as const,
} as const;
