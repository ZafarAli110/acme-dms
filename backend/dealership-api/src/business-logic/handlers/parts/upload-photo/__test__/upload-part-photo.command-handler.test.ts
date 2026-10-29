import {describe, expect, it} from 'vitest';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {AT_NORTHSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {fakeDocumentApi, jpeg} from '#test-setup/document-api/fake-document-api';
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
