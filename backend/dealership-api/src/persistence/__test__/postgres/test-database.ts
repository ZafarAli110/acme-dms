import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import {Client, Pool} from 'pg';
import {inject} from 'vitest';
import * as schema from '../../schema';
import {databaseUrl, TEMPLATE_DATABASE} from './global-setup';

/** A database of its own for one test file, cloned from the migrated template, dropped when disposed. */
export interface TestDatabase extends AsyncDisposable {
  connectionString: string;
  /** Drizzle on the test database, for seeding and checking outside the code under test. */
  db: NodePgDatabase<typeof schema>;
}

export async function createTestDatabaseAsync(): Promise<TestDatabase> {
  const adminUrl = inject('postgresAdminUrl');
  const name = `t_${crypto.randomUUID().replaceAll('-', '')}`;
  await runAdminAsync(adminUrl, `CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE}`);

  const connectionString = databaseUrl(adminUrl, name);
  const pool = new Pool({connectionString, max: 4});
  return {
    connectionString,
    db: drizzle(pool, {schema}),
    async [Symbol.asyncDispose]() {
      await pool.end();
      await runAdminAsync(adminUrl, `DROP DATABASE ${name} WITH (FORCE)`);
    },
  };
}

async function runAdminAsync(adminUrl: string, statement: string): Promise<void> {
  const admin = new Client({connectionString: adminUrl});
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}
