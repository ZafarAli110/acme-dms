import { useQuery } from "@tanstack/react-query";
import { partQueryOptions } from "../queries/partQueryOptions";

/** What the stock at the location is worth, in pence (`data` once `isSuccess`). */
export function useStockValue(locationId: string) {
  return useQuery({ ...partQueryOptions.stockValue(locationId), select: (value) => value.stockValueCents });
}
