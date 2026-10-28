import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {NORTHSIDE, RIVERSIDE, seedKit, TEST_USER_ID} from '#persistence/__test__/postgres/seed-kit';
import {createTestDatabaseAsync, type TestDatabase} from '#persistence/__test__/postgres/test-database';
import {createTestUnitOfWork, type TestUnitOfWork} from '#persistence/__test__/postgres/test-unit-of-work';
import {GetBinListQueryHandler} from '../get-bin-list.query-handler';

const sam: UserContext = {
  userId: TEST_USER_ID,
  dealerId: 'northwind',
  locationId: NORTHSIDE,
  permissions: ['parts.read'],
  accessToken: 't',
};

describe('GetBinListQueryHandler', () => {
  let database: TestDatabase;
  let unitOfWork: TestUnitOfWork;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    unitOfWork = createTestUnitOfWork(database);
  });

  afterAll(async () => {
    await unitOfWork[Symbol.asyncDispose]();
    await database[Symbol.asyncDispose]();
  });

  it("lists only the selected location's bins, without deleted ones", async () => {
    const seed = seedKit(database.db);
    await seed.addBinAsync({locationId: NORTHSIDE, code: 'A-01'});
    await seed.addBinAsync({locationId: RIVERSIDE, code: 'A-02'});
    await seed.addBinAsync({locationId: NORTHSIDE, code: 'A-03', deleted: true});

    const bins = await new GetBinListQueryHandler(unitOfWork.factory).executeAsync(sam);

    expect(bins.map((bin) => bin.code)).toEqual(['A-01']);
  });
});
