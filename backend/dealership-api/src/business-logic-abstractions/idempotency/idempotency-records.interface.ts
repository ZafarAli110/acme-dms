import type { IdempotencyClaim } from "#request-scope/data-scope";

export type { IdempotencyClaim };

/** What a save sent with a key asks for (ACME-125): whose key, the key, and the request it came with. */
export interface IdempotencyClaimRequest {
  dealerId: string;
  userId: string;
  key: string;
  /** The same request always has the same fingerprint: how the same key with another request is spotted. */
  fingerprint: string;
  /** Where the record is read, when the request already says (a change: its own path); null for an add. */
  resource: string | null;
}

/**
 * What a key's claim found:
 * - `mine`: a new key (or one past its 24 hours): this save runs and holds it;
 * - `taken-over`: the save that held it stopped before committing (its lease ran out): this save runs instead;
 * - `replay`: the same request already saved and answered: send its answer again;
 * - `running`: a save with this key is still running: try again shortly;
 * - `went-through`: a save with this key already went through, from another request (the form changed since), or
 *   committed without its answer being kept: never run again; `resource` is where it can be read, when known.
 */
export type IdempotencyClaimResult =
  | { kind: "mine"; claim: IdempotencyClaim }
  | { kind: "taken-over"; claim: IdempotencyClaim }
  | { kind: "replay"; answer: unknown }
  | { kind: "running" }
  | { kind: "went-through"; resource: string | null };

/** The keys saves are sent with, and what became of each (ACME-125). */
export interface IIdempotencyRecords {
  claimAsync(request: IdempotencyClaimRequest): Promise<IdempotencyClaimResult>;
  /** Keeps the save's answer, and where its record is read, for a save sent again with the same key. */
  completeAsync(claim: IdempotencyClaim, answer: unknown, resource: string | null): Promise<void>;
  /** Frees the key of a save that failed before it committed, so the corrected save can use it; never a committed one. */
  releaseAsync(claim: IdempotencyClaim): Promise<void>;
}

export const IDEMPOTENCY_RECORDS = Symbol("IIdempotencyRecords");
