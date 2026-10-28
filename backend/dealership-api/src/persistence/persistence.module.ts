import {resolve} from 'node:path';
import {Module} from '@nestjs/common';
import type {Pool} from 'pg';
import {migrateDatabaseAsync} from './migrations/migrate-database';
import {toPostgresUrl} from './unit-of-work/connection-string';
import {createDatabasePool} from './unit-of-work/database-pool';
import {UNIT_OF_WORK_FACTORY} from './unit-of-work/unit-of-work.factory.interface';
import {UnitOfWorkFactory} from './unit-of-work/unit-of-work.factory';

const DATABASE_POOL = Symbol('DatabasePool');

/** The SQL migrations, copied next to the bundle by scripts/build.ts. */
const MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'migrations');

/** Brings the database up to date (a development convenience: in production a release step would), then opens the pool. */
async function createDatabasePoolAsync(): Promise<Pool> {
  const connectionString = process.env['ConnectionStrings__dealership'];
  if (!connectionString) {
    throw new Error('ConnectionStrings__dealership is not set; dealership-api must run under Aspire.');
  }
  const url = toPostgresUrl(connectionString);
  await migrateDatabaseAsync(url, MIGRATIONS_FOLDER);
  return createDatabasePool(url);
}

/** The dealership database: the pool, and the unit of work factory every handler reads and writes through. */
@Module({
  providers: [
    {provide: DATABASE_POOL, useFactory: createDatabasePoolAsync},
    {provide: UNIT_OF_WORK_FACTORY, useFactory: (pool: Pool) => new UnitOfWorkFactory(pool), inject: [DATABASE_POOL]},
  ],
  exports: [UNIT_OF_WORK_FACTORY],
})
export class PersistenceModule {}
