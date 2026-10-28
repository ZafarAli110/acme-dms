import {BadRequestException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IPartInventoryRepository} from '#persistence/repositories/part-inventory.repository.interface';
import {GetStockListQueryHandler} from '../get-stock-list.query-handler';

const bob: UserContext = {
  userId: 'bob',
  dealerId: 'northwind',
  locationId: 'riverside',
  permissions: ['stock.read'],
  accessToken: 't',
};

describe('GetStockListQueryHandler', () => {
  it("reads stock for the user's selected location only", async () => {
    const inventories = {
      findPageForLocationAsync: vi.fn().mockResolvedValue({items: [], total: 0}),
    } satisfies Partial<IPartInventoryRepository> as unknown as IPartInventoryRepository;

    await new GetStockListQueryHandler(inventories).executeAsync(bob, {});

    expect(inventories.findPageForLocationAsync).toHaveBeenCalledWith('northwind', 'riverside', null, 1, 25);
  });

  it('needs a selected location', async () => {
    const inventories = {
      findPageForLocationAsync: vi.fn(),
    } satisfies Partial<IPartInventoryRepository> as unknown as IPartInventoryRepository;

    await expect(
      new GetStockListQueryHandler(inventories).executeAsync({...bob, locationId: null}, {}),
    ).rejects.toThrow(BadRequestException);
  });
});
