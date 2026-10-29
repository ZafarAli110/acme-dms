import {BadRequestException, ConflictException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {AT_NORTHSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {CreatePartCommandHandler} from '../create-part.command-handler';

describe('CreatePartCommandHandler', () => {
  const database = useTestDatabase();

  function handler(): CreatePartCommandHandler {
    return new CreatePartCommandHandler(database.unitOfWorkFactory, fixedClock());
  }

  function request(partNumber: string, binId: string) {
    return {partNumber, description: 'Brake pads', unitPrice: 49.99, binId, quantityOnHand: 6, reorderLevel: 4};
  }

  it('adds the part and stocks it in a bin of the selected location', async () => {
    const bin = await database.seed.addBinAsync({locationId: NORTHSIDE, code: 'A-01'});

    const part = await handler().executeAsync(AT_NORTHSIDE, request('BRK-001', bin.id));

    expect(part).toMatchObject({partNumber: 'BRK-001', unitPrice: 49.99, photos: []});
    expect(part.inventory).toEqual({
      binId: bin.id,
      binCode: 'A-01',
      quantityOnHand: 6,
      reorderLevel: 4,
      belowReorderLevel: false,
    });
  });

  it("refuses another location's bin", async () => {
    const riversideBin = await database.seed.addBinAsync({locationId: RIVERSIDE, code: 'R-01'});

    await expect(handler().executeAsync(AT_NORTHSIDE, request('BRK-002', riversideBin.id))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a live duplicate part number with the catalogue message', async () => {
    const bin = await database.seed.addBinAsync({locationId: NORTHSIDE, code: 'A-03'});
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'BRK-003'});

    await expect(handler().executeAsync(AT_NORTHSIDE, request('BRK-003', bin.id))).rejects.toThrow(
      new ConflictException('Part number BRK-003 already exists in your catalogue.'),
    );
  });

  it('allows a deleted part number again', async () => {
    const bin = await database.seed.addBinAsync({locationId: NORTHSIDE, code: 'A-04'});
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'BRK-004', deleted: true});

    await expect(handler().executeAsync(AT_NORTHSIDE, request('BRK-004', bin.id))).resolves.toMatchObject({
      partNumber: 'BRK-004',
    });
  });
});
