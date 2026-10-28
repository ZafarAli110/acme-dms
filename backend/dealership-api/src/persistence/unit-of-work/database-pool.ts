import {Pool} from 'pg';

const MAX_CONNECTIONS = 10;

/** The service's connections to the dealership database. Only units of work take connections from it. */
export function createDatabasePool(connectionString: string): Pool {
  return new Pool({connectionString, max: MAX_CONNECTIONS});
}
