import {useQuery} from '@tanstack/react-query';
import {customerQueries} from '../queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from '../queries/customerQueryKey';

/** How many customers the location has. `enabled` is false when the user may not read customers there. */
export function useCustomerCount(locationId: string, enabled: boolean) {
  return useQuery({
    queryKey: CUSTOMER_QUERY_KEYS.count(locationId),
    queryFn: ({signal}) => customerQueries.getCustomersAsync('', 1, 1, {signal}),
    select: (page) => page.total,
    enabled,
  });
}
