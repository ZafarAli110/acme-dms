import type { Query } from "@tanstack/react-query";
import { isBusyError } from "../config/apiErrors";

/**
 * Whether any query is waiting to try again after a busy answer: it is still fetching, and its last failure was busy.
 * The busy notice shows while this is true (ACME-122).
 */
export function isRetryingBusy(queries: readonly Query[]): boolean {
  return queries.some((query) => query.state.fetchStatus === "fetching" && isBusyError(query.state.fetchFailureReason));
}
