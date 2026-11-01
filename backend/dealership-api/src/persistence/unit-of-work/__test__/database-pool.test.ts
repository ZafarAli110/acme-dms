import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createTestDatabaseAsync, type TestDatabase} from '#test-setup/postgres/test-database';
import {createDatabasePool} from '../database-pool';

describe('createDatabasePool', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
  });

  afterAll(async () => {
    await database[Symbol.asyncDispose]();
  });

  it('has Postgres cancel a statement that runs longer than the statement timeout', async () => {
    const pool = createDatabasePool(database.connectionString, 200);
    try {
      // 57014 is query_canceled: Postgres stopped the statement itself.
      await expect(pool.query('SELECT pg_sleep(2)')).rejects.toMatchObject({code: '57014'});
      await expect(pool.query('SELECT 1 AS answer')).resolves.toMatchObject({rows: [{answer: 1}]});
    } finally {
      await pool.end();
    }
  });
});
