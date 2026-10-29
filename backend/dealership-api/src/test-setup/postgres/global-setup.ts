import {resolve} from 'node:path';
import {PostgreSqlContainer} from '@testcontainers/postgresql';
import {Client} from 'pg';
import type {TestProject} from 'vitest/node';
import {migrateDatabaseAsync} from '#persistence/migrations/migrate-database';

/** The database every test database is cloned from: migrated once per run. */
export const TEMPLATE_DATABASE = 'template_dealership';

const POSTGRES_IMAGE = 'postgres:18.3';
const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../persistence/migrations/drizzle');

declare module 'vitest' {
  export interface ProvidedContext {
    /** A connection string to the container's `postgres` database, for creating and dropping test databases. */
    postgresAdminUrl: string;
  }
}

/**
 * Vitest global setup (the function names are Vitest's): one Postgres container for the whole run, with a migrated
 * template database. Tests clone it (`createTestDatabaseAsync`) rather than share it.
 */
export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start().catch((error: unknown) => {
    throw new Error(
      'The integration tests need Docker or Podman running. With Podman, set DOCKER_HOST to its socket and ' +
        'TESTCONTAINERS_RYUK_DISABLED=true (README, "Prerequisites").',
      {cause: error},
    );
  });
  const adminUrl = databaseUrl(container.getConnectionUri(), 'postgres');

  const admin = new Client({connectionString: adminUrl});
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  await admin.end();
  await migrateDatabaseAsync(databaseUrl(adminUrl, TEMPLATE_DATABASE), MIGRATIONS_FOLDER);

  project.provide('postgresAdminUrl', adminUrl);
  return async () => {
    await container.stop();
  };
}

export function databaseUrl(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}
