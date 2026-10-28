import {useQuery} from '@tanstack/react-query';
import {customerQueryOptions} from '../queries/customerQueryOptions';

/** A customer of the selected location. Another location's customer is a 404, shown by the page. */
export function useCustomer(locationId: string, customerId: string) {
  return useQuery(customerQueryOptions.detail(locationId, customerId));
}
