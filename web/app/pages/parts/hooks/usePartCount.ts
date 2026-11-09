import { useQuery } from "@tanstack/react-query";
import { partQueryOptions } from "../queries/partQueryOptions";
import type { PartQuestion } from "../types/part";

/**
 * How many parts the question matches at the location, exactly. `enabled` is false when the user may not read parts
 * there. Prefetched by the routes that show it, so the total is there on the first paint.
 */
export function usePartCount(locationId: string, question: PartQuestion, enabled = true) {
  return useQuery({ ...partQueryOptions.count(locationId, question), select: (count) => count.total, enabled });
}
