import { Logger } from "@nestjs/common";
import type { Pool, PoolClient, QueryResult } from "pg";
import {
  currentDataScope,
  currentRequest,
  type IdempotencyClaim,
  isInRequest,
  type RequestInfo,
} from "#request-scope/data-scope";
import { DatabaseBusyError } from "./database-busy.error";
import { IdempotencyClaimLostError } from "./idempotency-claim-lost.error";
import type { DatabasePools } from "./database-pool";
import { UnitOfWork } from "./unit-of-work";
import type { IUnitOfWorkFactory } from "./unit-of-work.factory.interface";

/** The database role a request works as: row-level security policies apply to it (the `row_level_security` migration). */
export const REQUEST_ROLE = "dealership_api_user";

/** How long a request waits for a connection before it is answered "busy" (ACME-121), and work outside a request. */
export interface ConnectionWaits {
  listMs: number;
  saveMs: number;
  /** The export worker, the message consumer, the seed: they wait, and are never told "busy". */
  backgroundMs: number;
}

const logger = new Logger("UnitOfWorkFactory");

/** A request's later units of work still get this long, so one that is nearly out of its wait is not refused at once. */
const LEAST_WAIT_MS = 100;

/**
 * Opens a unit of work. Inside a request, the transaction works as REQUEST_ROLE with the request's dealer, location
 * and user, so Postgres row-level security filters every query by them: handlers do not repeat the dealer or the
 * location in their own `where`. A request whose scope was never set (a public endpoint, a guard that did not run)
 * works as REQUEST_ROLE with no scope at all, and sees no business row. Outside a request (the export worker, the
 * consumer, the seed) it works as the connection's own role, which owns the tables and is not filtered: that code
 * filters by hand. `asOwner` asks for that role inside a request too (see the interface).
 *
 * Which connections, and how long to wait for one (ACME-121): a request that reads uses the list pool and waits
 * `listMs`; a request that saves (its reads too) uses the save pool and waits `saveMs`; past that it is answered
 * "busy" (DatabaseBusyError) before its transaction begins, so nothing is written. Work outside a request uses the save
 * pool and waits `backgroundMs`, as before. When the request's caller goes away, the statement it is running is
 * cancelled (on the cancel pool's own connection); the listener goes when the unit of work ends, before its connection
 * is given back, so it can never cancel another request's statement.
 *
 * Given one pool (tests, scripts), that pool serves everything and nothing is ever "busy".
 */
export class UnitOfWorkFactory implements IUnitOfWorkFactory {
  private readonly _pools: DatabasePools;
  private readonly _waits: ConnectionWaits | null;

  public constructor(pools: DatabasePools | Pool, waits: ConnectionWaits | null = null) {
    this._pools = "lists" in pools ? pools : { lists: pools, saves: pools, health: pools, cancels: pools };
    this._waits = "lists" in pools ? waits : null;
  }

  public async beginAsync(
    options: { readOnly: boolean; asOwner?: boolean } = { readOnly: false },
  ): Promise<UnitOfWork> {
    const request = currentRequest();
    const client = await this.connectAsync(request);
    let pid: number | null = null;
    try {
      const begin = options.readOnly ? "BEGIN READ ONLY" : "BEGIN";
      const scope = currentDataScope();
      // The connection's backend id comes in the same round trip as BEGIN: the statement to cancel if the caller goes.
      const backend = request ? ", pg_backend_pid() AS pid" : "";
      let results: QueryResult | QueryResult[];
      if (!options.asOwner && (scope || isInRequest())) {
        // One round trip: the transaction and its settings together. `is_local` true: the settings last for this transaction
        // only, so the connection goes back to the pool as it came. An empty setting is NULL to the policies, which matches
        // no row. The values are the verified token's, written as literals (a simple query takes no parameters).
        const literal = (value: string): string => client.escapeLiteral(value);
        results = await client.query(
          `${begin}; SELECT set_config('role', ${literal(REQUEST_ROLE)}, true), ` +
            `set_config('app.dealer_id', ${literal(scope?.dealerId ?? "")}, true), ` +
            `set_config('app.location_id', ${literal(scope?.locationId ?? "")}, true), ` +
            `set_config('app.user_id', ${literal(scope?.userId ?? "")}, true)${backend}`,
        );
      } else {
        results = await client.query(request ? `${begin}; SELECT pg_backend_pid() AS pid` : begin);
      }
      if (request) {
        const last = Array.isArray(results) ? results.at(-1) : results;
        pid = (last?.rows[0] as { pid?: number } | undefined)?.pid ?? null;
      }
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    return this.watchedUnitOfWork(client, request, pid, options.readOnly ? null : (request?.idempotency ?? null));
  }

  public async beginHealthCheckAsync(): Promise<UnitOfWork> {
    const client = await this._pools.health.connect();
    try {
      await client.query("BEGIN READ ONLY");
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    return new UnitOfWork(client);
  }

  /** A connection from the pool the request uses, within its wait; "busy" past it, inside a request only. */
  private async connectAsync(request: RequestInfo | null): Promise<PoolClient> {
    if (!this._waits) {
      return this._pools.saves.connect();
    }
    const pool = request && !request.saves ? this._pools.lists : this._pools.saves;
    // One wait for the whole request (its ids, then its rows, are two units of work): "busy" within one wait.
    // After the request has committed, it is never told "busy": the answer must say what was saved.
    let waitMs = this._waits.backgroundMs;
    if (request && !request.committed) {
      request.connectBy ??= performance.now() + (request.saves ? this._waits.saveMs : this._waits.listMs);
      waitMs = Math.max(LEAST_WAIT_MS, request.connectBy - performance.now());
    }
    const connecting = pool.connect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooLong = new Promise<"too long">((resolve) => {
      timer = setTimeout(() => resolve("too long"), waitMs);
    });
    try {
      const first = await Promise.race([connecting, tooLong]);
      if (first !== "too long") {
        return first;
      }
    } finally {
      clearTimeout(timer);
    }
    // The connection may still come: give it straight back, unused.
    void connecting.then(
      (late) => late.release(),
      () => null,
    );
    if (request && !request.committed) {
      throw new DatabaseBusyError(Math.round(waitMs));
    }
    throw new Error(`No database connection came free within ${waitMs} ms.`);
  }

  /**
   * The unit of work, cancelling its statement when the request's caller goes away. A cancel already sent is waited
   * for before the connection goes back, so it can only ever reach this request's own statement.
   */
  private watchedUnitOfWork(
    client: PoolClient,
    request: RequestInfo | null,
    pid: number | null,
    claim: IdempotencyClaim | null,
  ): UnitOfWork {
    const markClaim = claim ? (onClient: PoolClient) => markClaimCommittedAsync(onClient, claim) : undefined;
    if (!request || pid === null) {
      return new UnitOfWork(client, undefined, undefined, markClaim);
    }
    const committed = (): void => {
      request.committed = true;
    };
    let cancelling: Promise<void> = Promise.resolve();
    const cancel = (): void => {
      cancelling = this.cancelStatementAsync(pid);
    };
    if (request.signal.aborted) {
      cancel();
    } else {
      request.signal.addEventListener("abort", cancel, { once: true });
    }
    return new UnitOfWork(
      client,
      async () => {
        request.signal.removeEventListener("abort", cancel);
        await cancelling;
      },
      committed,
      markClaim,
    );
  }

  private async cancelStatementAsync(pid: number): Promise<void> {
    try {
      await this._pools.cancels.query("SELECT pg_cancel_backend($1)", [pid]);
    } catch (error) {
      logger.warn(
        `Could not cancel an abandoned request's statement: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Marks the request's idempotency key committed, in the save's own transaction just before COMMIT (ACME-125): the
 * save and the mark commit together or not at all, so a key is `committed` exactly when its save is. Only the key's
 * holder may: when a second save has taken the key over (this one ran past its lease), it changes no row, and this
 * save rolls back rather than commit beside the second. The dealer and the user are written out, so it holds as the
 * request's role and as the owner alike.
 */
async function markClaimCommittedAsync(client: PoolClient, claim: IdempotencyClaim): Promise<void> {
  const marked = await client.query(
    `UPDATE idempotency_records SET state = 'committed'
     WHERE dealer_id = $1 AND user_id = $2 AND key = $3 AND holder = $4 AND state IN ('running', 'committed')`,
    [claim.dealerId, claim.userId, claim.key, claim.holder],
  );
  if (marked.rowCount !== 1) {
    throw new IdempotencyClaimLostError(claim.key);
  }
}
