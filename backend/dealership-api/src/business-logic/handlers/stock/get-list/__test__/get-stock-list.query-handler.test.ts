import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {GetStockListQueryHandler} from '../get-stock-list.query-handler';

describe('GetStockListQueryHandler', () => {
  const database = useTestDatabase();

  it("lists only this location's stock", async () => {
    await database.seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: 'STK-001',
      quantityOnHand: 1,
      reorderLevel: 3,
    });
    await database.seed.addStockedPartAsync({locationId: RIVERSIDE, partNumber: 'STK-002'});

    const stock = await new GetStockListQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
      search: undefined,
    });

    expect(stock.items.map((item) => [item.partNumber, item.quantityOnHand, item.belowReorderLevel])).toEqual([
      ['STK-001', 1, true],
    ]);
  });
});
