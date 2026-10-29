import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
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

  it('sorts by quantity and filters by the bin, counting the same rows it shows', async () => {
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'QTY-1', quantityOnHand: 3});
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'QTY-2', quantityOnHand: 9});
    await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'QTY-3', quantityOnHand: 6});
    const handler = new GetPartListQueryHandler(database.unitOfWorkFactory);

    const list = await handler.executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 2,
      sort: 'onHand',
      direction: 'desc',
      filterField: 'bin',
      filterOperator: 'startsWith',
      filterValue: 'B-QTY',
    });

    expect(list.items.map((item) => item.partNumber)).toEqual(['QTY-2', 'QTY-3']);
    expect(list.total).toBe(3);
  });
});
