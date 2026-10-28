/** Query keys for customers. Customers belong to a location, so every key starts with the location id. */
export const CUSTOMER_QUERY_KEYS = {
  all: (locationId: string) => ['customers', locationId] as const,
  list: (locationId: string, search: string, page: number, pageSize: number) =>
    ['customers', locationId, 'list', {search, page, pageSize}] as const,
  count: (locationId: string) => ['customers', locationId, 'count'] as const,
  recent: (locationId: string) => ['customers', locationId, 'recent'] as const,
  detail: (locationId: string, customerId: string) => ['customers', locationId, 'detail', customerId] as const,
} as const;
