import { useQuery } from "@tanstack/react-query";
import { customerQueryOptions } from "../queries/customerQueryOptions";
import type { CustomerQuestion } from "../types/customer";

/**
 * How many customers the question matches ("10,000+" past 10,000). `enabled` is false when the user may not read
 * customers there. Prefetched by the routes that show it, so the total is there on the first paint.
 */
export function useCustomerCount(locationId: string, question: CustomerQuestion, enabled = true) {
  return useQuery({ ...customerQueryOptions.count(locationId, question), select: (count) => count.total, enabled });
}
