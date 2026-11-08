/**
 * No database connection came free within the wait a request has (ACME-121): every connection of its kind is busy.
 * Thrown before the transaction begins, so nothing was written. The service answers it 503 "busy" with
 * `Retry-After`; it recognises it by `name` (`database-error.ts`), as the service may not import persistence.
 */
export class DatabaseBusyError extends Error {
  public override readonly name = "DatabaseBusyError";
  /** How long the request waited, for the log. */
  public readonly waitedMs: number;

  public constructor(waitedMs: number) {
    super(`No database connection came free within ${waitedMs} ms: the system is busy.`);
    this.waitedMs = waitedMs;
  }
}
