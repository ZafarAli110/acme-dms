import { useQuery } from "@tanstack/react-query";
import { pollIntervalMs } from "../formatters/photoProcessing";
import { partQueryOptions } from "../queries/partQueryOptions";

/**
 * A part as stocked at the selected location. Polls while a photo is still being processed, often and then slowly,
 * until the server's deadline for it has passed (`pollIntervalMs`): never for good.
 */
export function usePart(locationId: string, partId: string) {
  return useQuery({
    ...partQueryOptions.detail(locationId, partId),
    refetchInterval: (query) => pollIntervalMs(query.state.data?.photos ?? [], Date.now()),
  });
}
