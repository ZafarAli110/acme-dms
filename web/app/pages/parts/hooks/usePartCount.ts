import {useQuery} from '@tanstack/react-query';
import {partQueries} from '../queries/partQueries';
import {PART_QUERY_KEYS} from '../queries/partQueryKey';

/** How many parts the location stocks. `enabled` is false when the user may not read parts there. */
export function usePartCount(locationId: string, enabled: boolean) {
  return useQuery({
    queryKey: PART_QUERY_KEYS.count(locationId),
    queryFn: ({signal}) => partQueries.getPartsAsync('', 1, 1, {signal}),
    select: (page) => page.total,
    enabled,
  });
}
