import {QueryClient} from '@tanstack/react-query';
import {ApiError, isTransientError} from '../config/apiErrors';

/**
 * The one TanStack Query cache. A module rather than React state, so route loaders and actions (which run outside
 * React) prefetch into and invalidate the same cache the pages read.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once, and only when trying again can help: no answer, a timeout or a 5xx. A 4xx answer will not change.
      retry: (failureCount, error) =>
        failureCount < 1 && (isTransientError(error) || (error instanceof ApiError && error.status >= 500)),
      refetchOnWindowFocus: false,
    },
  },
});
