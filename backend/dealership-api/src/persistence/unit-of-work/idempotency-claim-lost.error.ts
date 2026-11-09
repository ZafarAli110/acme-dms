/**
 * A save's idempotency key was taken over by a second save with the same key while this one ran past its lease
 * (ACME-125): this save is not committed, so only one of the two saves. The service answers it as "your first save is
 * still going through" (409); it recognises it by `name`, as the service may not import persistence.
 */
export class IdempotencyClaimLostError extends Error {
  public override readonly name = "IdempotencyClaimLostError";

  public constructor(key: string) {
    super(`The idempotency key ${key} is no longer this save's: another save with it took it over. Nothing was saved.`);
  }
}
