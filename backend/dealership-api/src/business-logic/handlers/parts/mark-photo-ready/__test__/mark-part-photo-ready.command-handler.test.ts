import {eq} from 'drizzle-orm';
import {describe, expect, it} from 'vitest';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {NORTHSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {partPhotos} from '#persistence/schema/index';
import {MarkPartPhotoReadyCommandHandler} from '../mark-part-photo-ready.command-handler';

describe('MarkPartPhotoReadyCommandHandler', () => {
  const database = useTestDatabase();

  it('applies a message once', async () => {
    const {part} = await database.seed.addStockedPartAsync({locationId: NORTHSIDE, partNumber: 'MSG-001'});
    const photo = await database.seed.addPhotoAsync({partId: part.id, isDefault: true, status: 'pending'});
    const handler = new MarkPartPhotoReadyCommandHandler(database.unitOfWorkFactory, fixedClock());
    const message = {
      messageId: crypto.randomUUID(),
      type: 'document.processed.v1',
      occurredAt: '2026-11-03T09:00:00Z',
      correlationId: null,
      data: {documentId: photo.documentId, dealerId: 'northwind', ownerType: 'part', ownerId: part.id, variants: []},
    };

    await handler.executeAsync(message);
    await database.db.update(partPhotos).set({status: 'failed'}).where(eq(partPhotos.id, photo.id));
    await handler.executeAsync(message);

    const [read] = await database.db.select().from(partPhotos).where(eq(partPhotos.id, photo.id));
    expect(read?.status).toBe('failed');
  });
});
