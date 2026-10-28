import {useQuery} from '@tanstack/react-query';
import {partQueryOptions} from '../queries/partQueryOptions';

/** How many parts the location stocks. `enabled` is false when the user may not read parts there. */
export function usePartCount(locationId: string, enabled: boolean) {
  return useQuery({...partQueryOptions.count(locationId), select: (page) => page.total, enabled});
}
