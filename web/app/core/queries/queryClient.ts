import { QueryClient } from "@tanstack/react-query";
import { ApiError, isBusyError, isTransientError } from "../config/apiErrors";

/** A page answered busy tries again this many times, then says the system is still busy (ACME-122). */
const BUSY_TRIES_AGAIN = 2;
/** The busy answer's `Retry-After`: one second. */
const BUSY_RETRY_DELAY_MS = 1000;

/**
 * Whether a query tries again after its `failureCount`-th failure (0 after the first). Busy: twice. Otherwise once, and
 * only when trying again can help: no answer, a timeout or a 5xx. A 4xx answer will not change.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isBusyError(error)) {
    return failureCount < BUSY_TRIES_AGAIN;
  }
  return failureCount < 1 && (isTransientError(error) || (error instanceof ApiError && error.status >= 500));
}

/** How long a query waits before trying again: a second when busy, TanStack's own doubling wait otherwise. */
export function retryDelayMs(failureCount: number, error: unknown): number {
  return isBusyError(error) ? BUSY_RETRY_DELAY_MS : Math.min(1000 * 2 ** failureCount, 30_000);
}

/**
 * The one TanStack Query cache. A module rather than React state, so route loaders and actions (which run outside
 * React) prefetch into and invalidate the same cache the pages read.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: retryDelayMs,
      refetchOnWindowFocus: false,
      // Data a route's clientLoader just fetched is fresh for five minutes, so the page's hook does not fetch it a
      // second time on mount. Saves invalidate what they changed, and a location switch invalidates everything.
      staleTime: 5 * 60_000,
    },
    // A save is never sent again by itself (TanStack's default, written out): a busy save keeps its form and the person
    // sends it again (ACME-122).
    mutations: { retry: false },
  },
});
