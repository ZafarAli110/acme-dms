import { resolve } from "node:path";
import { Module } from "@nestjs/common";
import { migrateDatabaseAsync } from "./migrations/migrate-database";
import { toPostgresUrl } from "./unit-of-work/connection-string";
import { createDatabasePools, type DatabasePools } from "./unit-of-work/database-pool";
import { UNIT_OF_WORK_FACTORY } from "./unit-of-work/unit-of-work.factory.interface";
import { UnitOfWorkFactory } from "./unit-of-work/unit-of-work.factory";
import { requireSetting, SETTINGS, type Settings } from "#settings/settings";

const DATABASE_POOLS = Symbol("DatabasePools");

/** The SQL migrations, copied next to the bundle by scripts/build.ts. */
const MIGRATIONS_FOLDER = resolve(import.meta.dirname, "migrations");

/** Brings the database up to date (a development convenience: in production a release step would), then opens the pools. */
async function createDatabasePoolsAsync(settings: Settings): Promise<DatabasePools> {
  const url = toPostgresUrl(requireSetting(settings.dealershipDatabase, "ConnectionStrings__dealership"));
  await migrateDatabaseAsync(url, MIGRATIONS_FOLDER);
  return createDatabasePools(url, {
    maxConnections: settings.databaseMaxConnections,
    saveConnections: settings.databaseSaveConnections,
    connectionTimeoutMs: settings.databaseConnectionTimeoutMs,
    statementTimeoutMs: settings.databaseStatementTimeoutMs,
  });
}

/** The dealership database: the pools, and the unit of work factory every handler reads and writes through. */
@Module({
  providers: [
    { provide: DATABASE_POOLS, useFactory: createDatabasePoolsAsync, inject: [SETTINGS] },
    {
      provide: UNIT_OF_WORK_FACTORY,
      useFactory: (pools: DatabasePools, settings: Settings) =>
        new UnitOfWorkFactory(pools, {
          listMs: settings.databaseListWaitMs,
          saveMs: settings.databaseSaveWaitMs,
          backgroundMs: settings.databaseConnectionTimeoutMs,
        }),
      inject: [DATABASE_POOLS, SETTINGS],
    },
  ],
  exports: [UNIT_OF_WORK_FACTORY],
})
export class PersistenceModule {}
