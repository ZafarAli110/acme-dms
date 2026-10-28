import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {fakeDocumentApi, jpeg} from '../../__test__/fake-document-api';
import {UploadPartPhotoCommandHandler} from '../upload-part-photo.command-handler';

describe('UploadPartPhotoCommandHandler', () => {
  const database = useTestDatabase();

  it('adds a pending photo, the first one as default', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'UPL-001'});
    const documents = fakeDocumentApi();
    const handler = new UploadPartPhotoCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock());

    const first = await handler.executeAsync(AT_NORTHSIDE, part.id, jpeg('one.jpg'));
    const second = await handler.executeAsync(AT_NORTHSIDE, part.id, jpeg('two.jpg'));

    expect([first.isDefault, second.isDefault]).toEqual([true, false]);
    expect(first.status).toBe('pending');
  });
});
