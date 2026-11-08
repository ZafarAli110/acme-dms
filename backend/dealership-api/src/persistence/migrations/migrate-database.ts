import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/** Any fixed number: every instance asks Postgres for the same lock before it migrates. */
const MIGRATION_LOCK = 4_116_001;

/**
 * Applies the SQL migrations drizzle-kit generated (`bun run db:generate`) that the database has not had yet, in
 * order, recording them in `drizzle.__drizzle_migrations`. Runs at startup on its own connection.
 *
 * Several instances start together (more instances for more load, a rolling deploy): each takes the same advisory
 * lock first, so one migrates and the others wait, then find nothing left to apply. Without it two instances run the
 * same migration at once and one fails on "already exists".
 */
export async function migrateDatabaseAsync(connectionString: string, migrationsFolder: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await refusePreDrizzleSchemaAsync(client);
    await migrate(drizzle({ client }), { migrationsFolder });
  } finally {
    // Ending the connection releases the lock too; unlocking first lets a waiting instance go on at once.
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => undefined);
    await client.end();
  }
}

/**
 * A database from before the move to Drizzle has TypeORM's tables and history (`migrations`); the Drizzle baseline
 * would fail on them with "relation already exists". Say what to do instead.
 */
async function refusePreDrizzleSchemaAsync(client: Client): Promise<void> {
  const result = await client.query<{ typeorm: boolean }>(
    "SELECT to_regclass('public.migrations') IS NOT NULL AS typeorm",
  );
  if (result.rows[0]?.typeorm) {
    throw new Error(
      "The dealership database still has the pre-Drizzle schema (TypeORM). Run `bun run reset` from the repository " +
        "root, which recreates and migrates it, then restart dealership-api in the Aspire dashboard.",
    );
  }
}
