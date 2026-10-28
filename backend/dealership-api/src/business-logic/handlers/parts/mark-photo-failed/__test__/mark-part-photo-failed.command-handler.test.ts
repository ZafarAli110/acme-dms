import {eq} from 'drizzle-orm';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {NORTHSIDE} from '#persistence/__test__/postgres/seed-kit';
import {useTestDatabase} from '#persistence/__test__/postgres/use-test-database';
import {partPhotos} from '#persistence/schema/index';
import {MarkPartPhotoFailedCommandHandler} from '../mark-part-photo-failed.command-handler';

describe('MarkPartPhotoFailedCommandHandler', () => {
  const database = useTestDatabase();

  it('marks the photo failed with the reason', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'MSG-002'});
    const photo = await database.seed.addPhotoAsync({partId: part.id, isDefault: true, status: 'pending'});

    await new MarkPartPhotoFailedCommandHandler(database.unitOfWorkFactory, fixedClock()).executeAsync({
      messageId: crypto.randomUUID(),
      type: 'document.failed.v1',
      occurredAt: '2026-11-03T09:00:00Z',
      correlationId: null,
      data: {
        documentId: photo.documentId,
        dealerId: 'northwind',
        ownerType: 'part',
        ownerId: part.id,
        reason: 'Not an image',
      },
    });

    const [read] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, photo.id));
    expect(read).toMatchObject({status: 'failed', failureReason: 'Not an image'});
  });
});
