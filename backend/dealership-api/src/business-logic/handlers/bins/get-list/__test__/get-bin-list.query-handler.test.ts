import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE, RIVERSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {GetBinListQueryHandler} from '../get-bin-list.query-handler';

describe('GetBinListQueryHandler', () => {
  const database = useTestDatabase();

  it("lists only the selected location's bins, without deleted ones", async () => {
    await database.seed.addBinAsync({locationId: NORTHSIDE, code: 'A-01'});
    await database.seed.addBinAsync({locationId: RIVERSIDE, code: 'A-02'});
    await database.seed.addBinAsync({locationId: NORTHSIDE, code: 'A-03', deleted: true});

    const bins = await new GetBinListQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE);

    expect(bins.map((bin) => bin.code)).toEqual(['A-01']);
  });
});
