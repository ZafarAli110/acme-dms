import {eq, sql} from 'drizzle-orm';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestDatabaseAsync, type TestDatabase} from '#test-setup/postgres/test-database';
import {NORTHSIDE, SEEDED_AT, seedKit, TEST_USER_ID} from '#test-setup/postgres/seed-kit';
import {customers, parts} from '..';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIT = {createdAt: SEEDED_AT, createdBy: TEST_USER_ID, updatedAt: SEEDED_AT, updatedBy: TEST_USER_ID};

describe('the dealership schema', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
  });

  afterAll(async () => {
    await database[Symbol.asyncDispose]();
  });

  it('round-trips a plain date without shifting it', async () => {
    const saved = await seedKit(database.db).addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Gallagher',
      lastContactDate: Temporal.PlainDate.from('2026-03-14'),
    });

    const [read] = await database.db.select().from(customers).where(eq(customers.id, saved.id));

    expect(read?.lastContactDate?.toString()).toBe('2026-03-14');
  });

  it('round-trips money exactly', async () => {
    const rows = await database.db
      .insert(parts)
      .values([
        {partNumber: 'MONEY-1', description: 'Pads', unitPrice: 49.99, ...AUDIT},
        {partNumber: 'MONEY-2', description: 'Washer', unitPrice: 0.1, ...AUDIT},
      ])
      .returning({id: parts.id});

    const read = await database.db
      .select({unitPrice: parts.unitPrice})
      .from(parts)
      .where(sql`${parts.id} in (${rows[0]!.id}, ${rows[1]!.id})`)
      .orderBy(parts.partNumber);

    expect(read.map((row) => row.unitPrice)).toEqual([49.99, 0.1]);
    expect(typeof read[0]?.unitPrice).toBe('number');
  });

  it('generates uuidv7 ids', async () => {
    const [row] = await database.db
      .insert(parts)
      .values({partNumber: 'ID-1', description: 'Filter', unitPrice: 5, ...AUDIT})
      .returning({id: parts.id});

    expect(row?.id).toMatch(UUID_V7);
  });

  it('lets a soft-deleted part number be used again, and refuses a live duplicate', async () => {
    const [first] = await database.db
      .insert(parts)
      .values({partNumber: 'BRK-001', description: 'Pads', unitPrice: 45, ...AUDIT})
      .returning({id: parts.id});
    await database.db
      .update(parts)
      .set({isDeleted: true, deletedAt: SEEDED_AT, deletedBy: TEST_USER_ID})
      .where(eq(parts.id, first!.id));

    await database.db.insert(parts).values({partNumber: 'BRK-001', description: 'Pads', unitPrice: 45, ...AUDIT});

    await expect(
      database.db.insert(parts).values({partNumber: 'BRK-001', description: 'Pads', unitPrice: 45, ...AUDIT}),
    ).rejects.toMatchObject({cause: {code: '23505', constraint: 'uq_parts_part_number'}});
  });

  it('has no dealer column anywhere', async () => {
    const result = await database.db.execute<{count: number}>(
      sql`select count(*)::int as count from information_schema.columns
          where table_schema = 'public' and column_name = 'dealer_id'`,
    );

    expect(result.rows[0]?.count).toBe(0);
  });
});
