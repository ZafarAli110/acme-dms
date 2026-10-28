import {eq} from 'drizzle-orm';
import type {Pool} from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestDatabaseAsync, type TestDatabase} from '../../__test__/postgres/test-database';
import {NORTHSIDE, SEEDED_AT, TEST_USER_ID} from '../../__test__/postgres/seed-kit';
import {bins} from '../../schema';
import {createDatabasePool} from '../database-pool';
import {UnitOfWorkFactory} from '../unit-of-work.factory';

const AUDIT = {createdAt: SEEDED_AT, createdBy: TEST_USER_ID, updatedAt: SEEDED_AT, updatedBy: TEST_USER_ID};

function newBin(code: string) {
  return {locationId: NORTHSIDE, code, description: `Bin ${code}`, ...AUDIT};
}

describe('UnitOfWork', () => {
  let database: TestDatabase;
  let pool: Pool;
  let factory: UnitOfWorkFactory;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    pool = createDatabasePool(database.connectionString);
    factory = new UnitOfWorkFactory(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database[Symbol.asyncDispose]();
  });

  async function binExistsAsync(code: string): Promise<boolean> {
    const rows = await database.db.select({id: bins.id}).from(bins).where(eq(bins.code, code));
    return rows.length > 0;
  }

  it('commits what was written', async () => {
    {
      await using work = await factory.beginAsync();
      await work.db.insert(bins).values(newBin('C-01'));
      await work.commitAsync();
    }

    expect(await binExistsAsync('C-01')).toBe(true);
  });

  it('rolls back when disposed without a commit', async () => {
    {
      await using work = await factory.beginAsync();
      await work.db.insert(bins).values(newBin('R-01'));
    }

    expect(await binExistsAsync('R-01')).toBe(false);
  });

  it('rolls back when the block throws', async () => {
    async function failingAsync(): Promise<void> {
      await using work = await factory.beginAsync();
      await work.db.insert(bins).values(newBin('T-01'));
      throw new Error('the use case failed');
    }

    await expect(failingAsync()).rejects.toThrow('the use case failed');
    expect(await binExistsAsync('T-01')).toBe(false);
  });

  it('gives the connection back after failures', {timeout: 5_000}, async () => {
    async function failingAsync(): Promise<void> {
      await using work = await factory.beginAsync();
      await work.db.select().from(bins);
      throw new Error('boom');
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      await expect(failingAsync()).rejects.toThrow('boom');
    }

    await using work = await factory.beginAsync();
    await work.db.insert(bins).values(newBin('P-01'));
    await work.commitAsync();
    expect(await binExistsAsync('P-01')).toBe(true);
  });

  it('refuses writes in a read-only unit of work', async () => {
    await using work = await factory.beginAsync({readOnly: true});

    await expect(work.db.insert(bins).values(newBin('RO-01'))).rejects.toMatchObject({cause: {code: '25006'}});
  });

  it('refuses a second commit', async () => {
    await using work = await factory.beginAsync();
    await work.commitAsync();

    await expect(work.commitAsync()).rejects.toThrow('The unit of work is already committed.');
  });
});
