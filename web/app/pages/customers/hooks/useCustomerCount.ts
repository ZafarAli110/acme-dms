import {useQuery} from '@tanstack/react-query';
import {customerQueryOptions} from '../queries/customerQueryOptions';

/** How many customers the location has. `enabled` is false when the user may not read customers there. */
export function useCustomerCount(locationId: string, enabled: boolean) {
  return useQuery({...customerQueryOptions.count(locationId), select: (page) => page.total, enabled});
}
