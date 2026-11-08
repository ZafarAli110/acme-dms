import { Logger } from "@nestjs/common";
import { Pool } from "pg";

/** How the pool behaves: from the settings (DATABASE_*), or a test's own values. */
export interface DatabasePoolOptions {
  /** Connections kept open; every running unit of work holds one. */
  maxConnections: number;
  /** How long a unit of work waits for a free connection before failing, instead of hanging. */
  connectionTimeoutMs: number;
  /** Postgres cancels any statement that runs longer. Null: no limit. */
  statementTimeoutMs: number | null;
}

/** For tests and scripts: the settings' defaults, without a statement limit. */
export const DEFAULT_POOL_OPTIONS: DatabasePoolOptions = {
  maxConnections: 10,
  connectionTimeoutMs: 10_000,
  statementTimeoutMs: null,
};

const logger = new Logger("DatabasePool");

/**
 * The service's connections to the dealership database. Only units of work take connections from it. Each connection
 * tells Postgres to cancel any statement that runs longer than `options.statementTimeoutMs`: Node cannot cancel a
 * running query (pg has no AbortSignal), so the database does it, whoever was waiting.
 */
export function createDatabasePool(
  connectionString: string,
  options: DatabasePoolOptions = DEFAULT_POOL_OPTIONS,
): Pool {
  const pool = new Pool({
    connectionString,
    max: options.maxConnections,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    ...(options.statementTimeoutMs === null ? {} : { statement_timeout: options.statementTimeoutMs }),
  });
  // An idle connection the server ends (a restart, a network reset) is reported here. Without a listener Node treats
  // it as unhandled and the service exits; the pool already drops that connection and opens a new one when needed.
  pool.on("error", (error) => {
    logger.warn(`An idle database connection was closed and is replaced: ${error.message}`);
  });
  return pool;
}

/**
 * The service's pools (ACME-121). Lists and searches use `lists`; saves (a request that is not a GET or HEAD) and work
 * outside a request (the export worker, the message consumer) use `saves`, so a busy morning's lists can never take
 * the connections a save needs. The health check and the cancelling of abandoned statements have one connection
 * each, so neither waits behind the others, nor behind each other.
 */
export interface DatabasePools {
  lists: Pool;
  saves: Pool;
  health: Pool;
  cancels: Pool;
}

export interface DatabasePoolsOptions {
  /** All of lists and saves: `DATABASE_MAX_CONNECTIONS`. */
  maxConnections: number;
  /** Of those, kept for saves: `DATABASE_SAVE_CONNECTIONS`. */
  saveConnections: number;
  /** The longest anything waits for a connection (the wait outside a request): `DATABASE_CONNECTION_TIMEOUT`. */
  connectionTimeoutMs: number;
  statementTimeoutMs: number | null;
}

export function createDatabasePools(connectionString: string, options: DatabasePoolsOptions): DatabasePools {
  const pool = (maxConnections: number): Pool =>
    createDatabasePool(connectionString, {
      maxConnections,
      connectionTimeoutMs: options.connectionTimeoutMs,
      statementTimeoutMs: options.statementTimeoutMs,
    });
  const saveConnections = Math.min(options.saveConnections, options.maxConnections - 1);
  return {
    lists: pool(options.maxConnections - saveConnections),
    saves: pool(saveConnections),
    health: pool(1),
    cancels: pool(1),
  };
}
