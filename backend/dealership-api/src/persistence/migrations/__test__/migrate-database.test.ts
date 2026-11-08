import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDatabaseAsync } from "#test-setup/postgres/test-database";
import { migrateDatabaseAsync } from "../migrate-database";

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, "../drizzle");

describe("migrateDatabaseAsync", () => {
  it("refuses a database that still has the pre-Drizzle schema, and says how to fix it", async () => {
    await using database = await createTestDatabaseAsync();
    // TypeORM recorded its migrations in a table named `migrations`.
    await database.db.execute(sql`create table migrations (id integer primary key)`);

    await expect(migrateDatabaseAsync(database.connectionString, MIGRATIONS_FOLDER)).rejects.toThrow(
      /pre-Drizzle schema.*bun run reset/,
    );
  });

  it("lets several instances start at once: one migrates, the others wait and find nothing left to do", async () => {
    await using database = await createTestDatabaseAsync({ empty: true });

    const starts = Array.from({ length: 4 }, () => migrateDatabaseAsync(database.connectionString, MIGRATIONS_FOLDER));

    await expect(Promise.all(starts)).resolves.toHaveLength(4);
    // Each migration recorded once: nobody applied one twice.
    const applied = await database.db.execute<{ total: number; distinct: number }>(
      sql`select count(*)::int as total, count(distinct hash)::int as distinct from drizzle.__drizzle_migrations`,
    );
    expect(applied.rows[0]?.total).toBeGreaterThan(0);
    expect(applied.rows[0]?.total).toBe(applied.rows[0]?.distinct);
  });

  it("brings an up-to-date database up to date without complaint", async () => {
    await using database = await createTestDatabaseAsync();

    await expect(migrateDatabaseAsync(database.connectionString, MIGRATIONS_FOLDER)).resolves.toBeUndefined();
  });
});
