import {useQuery} from '@tanstack/react-query';
import {customerQueryOptions} from '../queries/customerQueryOptions';

/** The location's most recently contacted customers, newest first. */
export function useRecentCustomers(locationId: string, enabled: boolean) {
  return useQuery({...customerQueryOptions.recent(locationId), enabled});
}
