import {resolve} from 'node:path';
import {sql} from 'drizzle-orm';
import {describe, expect, it} from 'vitest';
import {createTestDatabaseAsync} from '../../__test__/postgres/test-database';
import {migrateDatabaseAsync} from '../migrate-database';

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../drizzle');

describe('migrateDatabaseAsync', () => {
  it('refuses a database that still has the pre-Drizzle schema, and says how to fix it', async () => {
    await using database = await createTestDatabaseAsync();
    // TypeORM recorded its migrations in a table named `migrations`.
    await database.db.execute(sql`create table migrations (id integer primary key)`);

    await expect(migrateDatabaseAsync(database.connectionString, MIGRATIONS_FOLDER)).rejects.toThrow(
      /pre-Drizzle schema.*bun run reset/,
    );
  });

  it('brings an up-to-date database up to date without complaint', async () => {
    await using database = await createTestDatabaseAsync();

    await expect(migrateDatabaseAsync(database.connectionString, MIGRATIONS_FOLDER)).resolves.toBeUndefined();
  });
});
