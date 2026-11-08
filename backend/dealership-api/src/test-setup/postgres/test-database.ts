import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { inject } from "vitest";
import { databaseUrl, TEMPLATE_DATABASE } from "./global-setup";

/**
 * A database of its own for one test file, cloned from the migrated template (or empty, with `{ empty: true }`, for
 * testing the migrations themselves), dropped when disposed.
 */
export interface TestDatabase extends AsyncDisposable {
  connectionString: string;
  /** Drizzle on the test database, for seeding and checking outside the code under test. */
  db: NodePgDatabase;
}

export async function createTestDatabaseAsync(options: { empty?: boolean } = {}): Promise<TestDatabase> {
  const adminUrl = inject("postgresAdminUrl");
  const name = `t_${crypto.randomUUID().replaceAll("-", "")}`;
  await runAdminAsync(adminUrl, `CREATE DATABASE ${name} TEMPLATE ${options.empty ? "template0" : TEMPLATE_DATABASE}`);

  const connectionString = databaseUrl(adminUrl, name);
  const pool = new Pool({ connectionString, max: 4 });
  return {
    connectionString,
    db: drizzle({ client: pool }),
    async [Symbol.asyncDispose]() {
      await pool.end();
      await runAdminAsync(adminUrl, `DROP DATABASE ${name} WITH (FORCE)`);
    },
  };
}

async function runAdminAsync(adminUrl: string, statement: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}
