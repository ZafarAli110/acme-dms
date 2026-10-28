import {BadRequestException, ConflictException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {Bin} from '#persistence/entities/bin.entity';
import type {IBinRepository} from '#persistence/repositories/bin.repository.interface';
import type {IPartRepository} from '#persistence/repositories/part.repository.interface';
import {CreatePartCommandHandler} from '../create-part.command-handler';

const alice: UserContext = {
  userId: 'alice',
  dealerId: 'northwind',
  locationId: 'northside',
  permissions: ['parts.write'],
  accessToken: 't',
};

const shelfA = {id: 'bin-a', locationId: 'northside', code: 'A-01', description: 'Brakes'} as Bin;
const request = {
  partNumber: 'BRK-001',
  description: 'Brake pads',
  unitPrice: 49.99,
  binId: 'bin-a',
  quantityOnHand: 6,
  reorderLevel: 4,
};

function setUp({partNumberTaken = false, bin = shelfA as Bin | null} = {}) {
  const createWithInventoryAsync = vi.fn().mockResolvedValue(undefined);
  const parts = {
    existsWithPartNumberAsync: vi.fn().mockResolvedValue(partNumberTaken),
    createWithInventoryAsync,
  } satisfies Partial<IPartRepository> as unknown as IPartRepository;
  const findByIdAsync = vi.fn().mockResolvedValue(bin);
  const bins = {findByIdAsync} satisfies Partial<IBinRepository> as unknown as IBinRepository;
  return {handler: new CreatePartCommandHandler(parts, bins, fixedClock()), createWithInventoryAsync, findByIdAsync};
}

describe('CreatePartCommandHandler', () => {
  it('adds the part to the catalogue and stocks it in the chosen bin of the selected location', async () => {
    const {handler, createWithInventoryAsync, findByIdAsync} = setUp();

    const part = await handler.executeAsync(alice, request);

    expect(findByIdAsync).toHaveBeenCalledWith('northwind', 'northside', 'bin-a');
    expect(createWithInventoryAsync).toHaveBeenCalledWith(
      'northwind',
      expect.objectContaining({partNumber: 'BRK-001', createdBy: 'alice'}),
      expect.objectContaining({locationId: 'northside', binId: 'bin-a', quantityOnHand: 6, reorderLevel: 4}),
    );
    expect(part.inventory).toEqual({
      binId: 'bin-a',
      binCode: 'A-01',
      quantityOnHand: 6,
      reorderLevel: 4,
      belowReorderLevel: false,
    });
  });

  it('refuses a bin that does not belong to the selected location', async () => {
    const {handler, createWithInventoryAsync} = setUp({bin: null});

    await expect(handler.executeAsync(alice, request)).rejects.toThrow(BadRequestException);
    expect(createWithInventoryAsync).not.toHaveBeenCalled();
  });

  it('rejects a part number the dealer already uses', async () => {
    const {handler} = setUp({partNumberTaken: true});

    await expect(handler.executeAsync(alice, request)).rejects.toThrow(ConflictException);
  });
});
