import { useQuery } from "@tanstack/react-query";
import { isWorthPolling } from "../formatters/photoProcessing";
import { partQueryOptions } from "../queries/partQueryOptions";

/**
 * A part as stocked at the selected location. Polls while a photo is still being processed, for a while: a photo
 * document-api never finishes would otherwise keep the page asking for good.
 */
export function usePart(locationId: string, partId: string) {
  return useQuery({
    ...partQueryOptions.detail(locationId, partId),
    refetchInterval: (query) => (isWorthPolling(query.state.data?.photos ?? [], Date.now()) ? 2000 : false),
  });
}
