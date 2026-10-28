import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

/**
 * Applies the SQL migrations drizzle-kit generated (`bun run db:generate`) that the database has not had yet, in
 * order, recording them in `drizzle.__drizzle_migrations`. Runs at startup on its own connection.
 */
export async function migrateDatabaseAsync(connectionString: string, migrationsFolder: string): Promise<void> {
  const client = new Client({connectionString});
  await client.connect();
  try {
    await refusePreDrizzleSchemaAsync(client);
    await migrate(drizzle(client), {migrationsFolder});
  } finally {
    await client.end();
  }
}

/**
 * A database from before the move to Drizzle has TypeORM's tables and history (`migrations`); the Drizzle baseline
 * would fail on them with "relation already exists". Say what to do instead.
 */
async function refusePreDrizzleSchemaAsync(client: Client): Promise<void> {
  const result = await client.query<{typeorm: boolean}>(
    "SELECT to_regclass('public.migrations') IS NOT NULL AS typeorm",
  );
  if (result.rows[0]?.typeorm) {
    throw new Error(
      'The dealership database still has the pre-Drizzle schema (TypeORM). Run `bun run reset` from the repository ' +
        'root, which recreates and migrates it, then restart dealership-api in the Aspire dashboard.',
    );
  }
}
