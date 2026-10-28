import {Logger} from '@nestjs/common';
import {Pool} from 'pg';

const MAX_CONNECTIONS = 10;
/** How long a unit of work waits for a free connection before failing, instead of hanging. */
const CONNECTION_TIMEOUT_MS = 10_000;

const logger = new Logger('DatabasePool');

/** The service's connections to the dealership database. Only units of work take connections from it. */
export function createDatabasePool(connectionString: string): Pool {
  const pool = new Pool({connectionString, max: MAX_CONNECTIONS, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS});
  // An idle connection the server ends (a restart, a network reset) is reported here. Without a listener Node treats
  // it as unhandled and the service exits; the pool already drops that connection and opens a new one when needed.
  pool.on('error', (error) => {
    logger.warn(`An idle database connection was closed and is replaced: ${error.message}`);
  });
  return pool;
}
