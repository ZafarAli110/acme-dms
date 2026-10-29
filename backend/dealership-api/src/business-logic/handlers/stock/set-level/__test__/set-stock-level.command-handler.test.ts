import {describe, expect, it} from 'vitest';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {AT_RIVERSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {SetStockLevelCommandHandler} from '../set-stock-level.command-handler';

describe('SetStockLevelCommandHandler', () => {
  const database = useTestDatabase();

  it('stocks a part at this location for the first time, then updates the levels it has', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'SET-001'});
    const riversideBin = await database.seed.addBinAsync({locationId: RIVERSIDE, code: 'R-09'});
    const handler = new SetStockLevelCommandHandler(database.unitOfWorkFactory, fixedClock());

    const first = await handler.executeAsync(AT_RIVERSIDE, part.id, {
      binId: riversideBin.id,
      quantityOnHand: 2,
      reorderLevel: 1,
    });
    const second = await handler.executeAsync(AT_RIVERSIDE, part.id, {
      binId: riversideBin.id,
      quantityOnHand: 7,
      reorderLevel: 3,
    });

    expect([first.quantityOnHand, second.quantityOnHand, second.reorderLevel]).toEqual([2, 7, 3]);
  });
});
