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
    await migrate(drizzle(client), {migrationsFolder});
  } finally {
    await client.end();
  }
}
