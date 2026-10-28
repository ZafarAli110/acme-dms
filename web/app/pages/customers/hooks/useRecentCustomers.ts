import {useQuery} from '@tanstack/react-query';
import {customerQueries} from '../queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from '../queries/customerQueryKey';

/** The location's most recently contacted customers, newest first. */
export function useRecentCustomers(locationId: string, enabled: boolean) {
  return useQuery({
    queryKey: CUSTOMER_QUERY_KEYS.recent(locationId),
    queryFn: ({signal}) => customerQueries.getRecentCustomersAsync({signal}),
    enabled,
  });
}
