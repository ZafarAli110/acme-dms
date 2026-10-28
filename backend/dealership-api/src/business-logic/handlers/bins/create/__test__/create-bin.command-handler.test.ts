import {ConflictException} from '@nestjs/common';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {NORTHSIDE, RIVERSIDE, TEST_USER_ID} from '#persistence/__test__/postgres/seed-kit';
import {createTestDatabaseAsync, type TestDatabase} from '#persistence/__test__/postgres/test-database';
import {createTestUnitOfWork, type TestUnitOfWork} from '#persistence/__test__/postgres/test-unit-of-work';
import {CreateBinCommandHandler} from '../create-bin.command-handler';

function atLocation(locationId: string): UserContext {
  return {
    userId: TEST_USER_ID,
    dealerId: 'northwind',
    locationId,
    permissions: ['parts.write'],
    accessToken: 't',
  };
}

describe('CreateBinCommandHandler', () => {
  let database: TestDatabase;
  let unitOfWork: TestUnitOfWork;
  let handler: CreateBinCommandHandler;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    unitOfWork = createTestUnitOfWork(database);
    handler = new CreateBinCommandHandler(unitOfWork.factory, fixedClock());
  });

  afterAll(async () => {
    await unitOfWork[Symbol.asyncDispose]();
    await database[Symbol.asyncDispose]();
  });

  it('creates the bin at the selected location', async () => {
    const bin = await handler.executeAsync(atLocation(NORTHSIDE), {code: 'A-01', description: 'Brakes'});

    expect(bin).toMatchObject({code: 'A-01', description: 'Brakes'});
    expect(bin.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('rejects a code already used at this location', async () => {
    await handler.executeAsync(atLocation(NORTHSIDE), {code: 'A-02', description: 'Filters'});

    await expect(handler.executeAsync(atLocation(NORTHSIDE), {code: 'A-02', description: 'Filters'})).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows the same code at another location', async () => {
    await handler.executeAsync(atLocation(NORTHSIDE), {code: 'A-03', description: 'Oil'});

    await expect(
      handler.executeAsync(atLocation(RIVERSIDE), {code: 'A-03', description: 'Oil'}),
    ).resolves.toMatchObject({code: 'A-03'});
  });
});
