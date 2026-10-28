import {resolve} from 'node:path';
import {Module} from '@nestjs/common';
import type {Pool} from 'pg';
import type {DataSource} from 'typeorm';
import {createDataSourceAsync} from './data-source/data-source.factory';
import {migrateDatabaseAsync} from './migrations/migrate-database';
import {BIN_REPOSITORY} from './repositories/bin.repository.interface';
import {BinRepository} from './repositories/bin.repository';
import {PART_INVENTORY_REPOSITORY} from './repositories/part-inventory.repository.interface';
import {PartInventoryRepository} from './repositories/part-inventory.repository';
import {PART_PHOTO_REPOSITORY} from './repositories/part-photo.repository.interface';
import {PartPhotoRepository} from './repositories/part-photo.repository';
import {PART_REPOSITORY} from './repositories/part.repository.interface';
import {PartRepository} from './repositories/part.repository';
import {toPostgresUrl} from './unit-of-work/connection-string';
import {createDatabasePool} from './unit-of-work/database-pool';
import {UNIT_OF_WORK_FACTORY} from './unit-of-work/unit-of-work.factory.interface';
import {UnitOfWorkFactory} from './unit-of-work/unit-of-work.factory';

export const DATA_SOURCE = Symbol('DataSource');
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

const UNIT_OF_WORK_PROVIDERS = [
  {provide: DATABASE_POOL, useFactory: createDatabasePoolAsync},
  {provide: UNIT_OF_WORK_FACTORY, useFactory: (pool: Pool) => new UnitOfWorkFactory(pool), inject: [DATABASE_POOL]},
];

/** Registers every repository against its abstraction token. Add one line per new repository. */
const REPOSITORIES = [
  {
    provide: PART_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: PART_INVENTORY_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartInventoryRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: BIN_REPOSITORY,
    useFactory: (dataSource: DataSource) => new BinRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: PART_PHOTO_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartPhotoRepository(dataSource),
    inject: [DATA_SOURCE],
  },
];

@Module({
  providers: [
    ...UNIT_OF_WORK_PROVIDERS,
    {provide: DATA_SOURCE, useFactory: createDataSourceAsync, inject: [DATABASE_POOL]},
    ...REPOSITORIES,
  ],
  exports: [UNIT_OF_WORK_FACTORY, DATA_SOURCE, ...REPOSITORIES.map((repository) => repository.provide)],
})
export class PersistenceModule {}
