import type {ListParams} from '../../../core/paging/listParams';

/**
 * Query keys for parts. Parts are read at a location, so every key starts with the location id: switching location
 * never shows the previous location's data, and `all(locationId)` invalidates everything for one location.
 */
export const PART_QUERY_KEYS = {
  all: (locationId: string) => ['parts', locationId] as const,
  list: (locationId: string, params: ListParams) => ['parts', locationId, 'list', params] as const,
  count: (locationId: string) => ['parts', locationId, 'count'] as const,
  detail: (locationId: string, partId: string) => ['parts', locationId, 'detail', partId] as const,
  bins: (locationId: string) => ['bins', locationId] as const,
} as const;
