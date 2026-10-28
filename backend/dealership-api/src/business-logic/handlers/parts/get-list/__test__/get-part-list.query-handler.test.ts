import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE, RIVERSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {GetPartListQueryHandler} from '../get-part-list.query-handler';

describe('GetPartListQueryHandler', () => {
  const database = useTestDatabase();

  it('lists only parts stocked at the selected location, without deleted ones, with their default thumbnail', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'AIR-001'});
    await database.seed.addPhotoAsync({partId: part.id, isDefault: false});
    const thumbnail = await database.seed.addPhotoAsync({partId: part.id, isDefault: true});
    await database.seed.addStockedPartAsync({locationId: RIVERSIDE, partNumber: 'RIV-001'});
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'OLD-001', deleted: true});

    const list = await new GetPartListQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
      search: undefined,
    });

    expect(list.items.map((item) => item.partNumber)).toEqual(['AIR-001']);
    expect(list.items[0]?.thumbnailDocumentId).toBe(thumbnail.documentId);
    expect(list.total).toBe(1);
  });

  it('searches part number and description', async () => {
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'BRK-777'});

    const list = await new GetPartListQueryHandler(database.unitOfWorkFactory).executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
      search: 'brk-7',
    });

    expect(list.items.map((item) => item.partNumber)).toEqual(['BRK-777']);
  });
});
