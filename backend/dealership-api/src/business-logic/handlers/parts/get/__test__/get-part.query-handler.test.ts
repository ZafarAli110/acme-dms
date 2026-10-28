import {NotFoundException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {RIVERSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {GetPartQueryHandler} from '../get-part.query-handler';

describe('GetPartQueryHandler', () => {
  const database = useTestDatabase();

  it('returns a part not stocked here as not found', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: RIVERSIDE, partNumber: 'RIV-002'});

    await expect(
      new GetPartQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, part.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns the part with its photos, without deleted ones', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: AT_NORTHSIDE.locationId!, partNumber: 'NS-1'});
    const kept = await database.seed.addPhotoAsync({partId: part.id, isDefault: true});
    await database.seed.addPhotoAsync({partId: part.id, isDefault: false, deleted: true});

    const read = await new GetPartQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, part.id);

    expect(read.photos.map((photo) => photo.id)).toEqual([kept.id]);
  });
});
