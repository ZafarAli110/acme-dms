import {BadRequestException} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {AT_NORTHSIDE} from '#business-logic/user-context/__test__/test-users';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {partPhotos, parts} from '#persistence/schema/index';
import {fakeDocumentApi, jpeg} from '../../__test__/fake-document-api';
import {UpdatePartCommandHandler} from '../update-part.command-handler';

describe('UpdatePartCommandHandler', () => {
  const database = useTestDatabase();

  async function partWithTwoPhotosAsync(partNumber: string) {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber});
    const photoA = await database.seed.addPhotoAsync({partId: part.id, isDefault: true});
    const photoB = await database.seed.addPhotoAsync({partId: part.id, isDefault: false});
    return {part, photoA, photoB};
  }

  it('saves the changes and photo changes in one transaction', async () => {
    const {part, photoA, photoB} = await partWithTwoPhotosAsync('UPD-001');
    const documents = fakeDocumentApi();

    const saved = await new UpdatePartCommandHandler(
      database.unitOfWorkFactory,
      documents.client,
      fixedClock(),
    ).executeAsync(
      AT_NORTHSIDE,
      part.id,
      {
        description: 'Ceramic pads',
        photos: [
          {id: photoA.id, isDefault: false},
          {id: photoB.id, isDefault: false},
        ],
        newPhotos: [{isDefault: true}],
      },
      [jpeg('new.jpg')],
    );

    expect(saved.description).toBe('Ceramic pads');
    expect(saved.photos.map((photo) => [photo.originalFileName, photo.isDefault, photo.status])).toEqual([
      ['photo.jpg', false, 'ready'],
      ['photo.jpg', false, 'ready'],
      ['new.jpg', true, 'pending'],
    ]);
  });

  it('soft-deletes removed photos and deletes their files after the save', async () => {
    const {part, photoA, photoB} = await partWithTwoPhotosAsync('UPD-002');
    const documents = fakeDocumentApi();

    const saved = await new UpdatePartCommandHandler(
      database.unitOfWorkFactory,
      documents.client,
      fixedClock(),
    ).executeAsync(AT_NORTHSIDE, part.id, {photos: [{id: photoA.id, isDefault: true}]}, []);

    const [removed] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, photoB.id));
    expect(saved.photos.map((photo) => photo.id)).toEqual([photoA.id]);
    expect(removed).toMatchObject({isDeleted: true, deletedBy: AT_NORTHSIDE.userId});
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(AT_NORTHSIDE, photoB.documentId);
  });

  it('deletes the uploaded documents when the save fails', async () => {
    const {part} = await partWithTwoPhotosAsync('UPD-003');
    const other = await partWithTwoPhotosAsync('UPD-004');
    const documents = fakeDocumentApi();

    await expect(
      new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()).executeAsync(
        AT_NORTHSIDE,
        part.id,
        // A photo of another part: refused before anything is uploaded…
        {photos: [{id: other.photoA.id, isDefault: true}]},
        [],
      ),
    ).rejects.toThrow(BadRequestException);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();

    // …while a failure after the upload (the description too long for its column) deletes what was uploaded.
    await expect(
      new UpdatePartCommandHandler(database.unitOfWorkFactory, documents.client, fixedClock()).executeAsync(
        AT_NORTHSIDE,
        part.id,
        {description: 'x'.repeat(600), newPhotos: [{isDefault: false}]},
        [jpeg('late.jpg')],
      ),
    ).rejects.toThrow();
    const uploaded = await documents.uploadDocumentAsync.mock.results[0]?.value;
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(AT_NORTHSIDE, uploaded.id);
    const [unchanged] = await database.db.select().from(parts).where(eq(parts.id, part.id));
    expect(unchanged?.description).toBe('Part UPD-003');
  });
});
