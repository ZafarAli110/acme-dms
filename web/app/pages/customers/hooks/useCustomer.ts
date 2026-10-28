import {useQuery} from '@tanstack/react-query';
import {customerQueries} from '../queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from '../queries/customerQueryKey';

/** A customer of the selected location. Another location's customer is a 404, shown by the page. */
export function useCustomer(locationId: string, customerId: string) {
  return useQuery({
    queryKey: CUSTOMER_QUERY_KEYS.detail(locationId, customerId),
    queryFn: ({signal}) => customerQueries.getCustomerAsync(customerId, {signal}),
  });
}
