import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import {TEST_NOW, fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IDocumentApiClient} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {Bin} from '#persistence/entities/bin.entity';
import type {PartInventory} from '#persistence/entities/part-inventory.entity';
import type {PartPhoto} from '#persistence/entities/part-photo.entity';
import type {Part} from '#persistence/entities/part.entity';
import type {IPartInventoryRepository} from '#persistence/repositories/part-inventory.repository.interface';
import type {IPartPhotoRepository} from '#persistence/repositories/part-photo.repository.interface';
import type {IPartRepository} from '#persistence/repositories/part.repository.interface';
import {UpdatePartCommandHandler} from '../update-part.command-handler';

const alice: UserContext = {
  userId: 'alice',
  dealerId: 'northwind',
  locationId: 'northside',
  permissions: ['parts.write'],
  accessToken: 't',
};

const jpeg = (fileName: string): PartPhotoUploadRequestDto => ({
  fileName,
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  content: new Uint8Array([1]),
});

const PHOTO_A = {id: 'photo-a', documentId: 'doc-a', isDefault: true, createdAt: TEST_NOW} as PartPhoto;
const PHOTO_B = {id: 'photo-b', documentId: 'doc-b', isDefault: false, createdAt: TEST_NOW} as PartPhoto;

function setUp(existingPhotos: PartPhoto[] = [PHOTO_A, PHOTO_B]) {
  const part = {
    id: 'p1',
    dealerId: 'northwind',
    partNumber: 'BRK-PAD-001',
    description: 'Front brake pads, ceramic',
    unitPrice: 49.99,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  } as Part;
  const parts = {
    findByIdAsync: vi.fn().mockResolvedValue(part),
    saveWithPhotosAsync: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<IPartRepository> as unknown as IPartRepository;
  const inventories = {
    findForPartAsync: vi.fn().mockResolvedValue({
      inventory: {quantityOnHand: 6, reorderLevel: 4} as PartInventory,
      bin: {id: 'bin-a', code: 'A-01'} as Bin,
    }),
  } satisfies Partial<IPartInventoryRepository> as unknown as IPartInventoryRepository;
  const photos = {
    findForPartAsync: vi.fn().mockResolvedValue(existingPhotos),
  } satisfies Partial<IPartPhotoRepository> as unknown as IPartPhotoRepository;
  let uploads = 0;
  const documents = {
    uploadDocumentAsync: vi.fn(() => Promise.resolve({id: `doc-new-${++uploads}`, status: 'Pending'})),
    deleteDocumentAsync: vi.fn().mockResolvedValue(undefined),
  } satisfies IDocumentApiClient;
  return {handler: new UpdatePartCommandHandler(parts, inventories, photos, documents, fixedClock()), parts, documents};
}

describe('UpdatePartCommandHandler', () => {
  it('changes only the fields that were sent and keeps the photos as they are', async () => {
    const {handler, parts, documents} = setUp();

    const updated = await handler.executeAsync(alice, 'p1', {unitPrice: 54.5}, []);

    expect(updated).toMatchObject({unitPrice: 54.5, description: 'Front brake pads, ceramic'});
    expect(parts.saveWithPhotosAsync).toHaveBeenCalledWith('northwind', expect.objectContaining({unitPrice: 54.5}), {
      removedPhotoIds: [],
      deletedBy: 'alice',
      at: TEST_NOW,
      kept: [
        {id: 'photo-a', isDefault: true},
        {id: 'photo-b', isDefault: false},
      ],
      addedPhotos: [],
    });
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
  });

  it('refuses an empty change', async () => {
    const {handler, parts} = setUp();

    await expect(handler.executeAsync(alice, 'p1', {}, [])).rejects.toThrow(BadRequestException);
    expect(parts.saveWithPhotosAsync).not.toHaveBeenCalled();
  });

  it('adds new photos as pending, removes the photos left out, and deletes their files after the save', async () => {
    const {handler, parts, documents} = setUp();

    await handler.executeAsync(
      alice,
      'p1',
      {photos: [{id: 'photo-b', isDefault: false}], newPhotos: [{isDefault: true}]},
      [jpeg('new.jpg')],
    );

    const saved = vi.mocked(parts.saveWithPhotosAsync).mock.calls[0]?.[2];
    expect(saved?.removedPhotoIds).toEqual(['photo-a']);
    expect(saved?.addedPhotos).toEqual([
      expect.objectContaining({documentId: 'doc-new-1', status: 'pending', isDefault: true, partId: 'p1'}),
    ]);
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(alice, 'doc-a');
    expect(vi.mocked(documents.deleteDocumentAsync).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(parts.saveWithPhotosAsync).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('validates every file before uploading any: a bad file means nothing is uploaded or saved', async () => {
    const {handler, parts, documents} = setUp();

    await expect(
      handler.executeAsync(alice, 'p1', {newPhotos: [{isDefault: false}, {isDefault: false}]}, [
        jpeg('good.jpg'),
        {...jpeg('notes.pdf'), contentType: 'application/pdf'},
      ]),
    ).rejects.toThrow(/notes\.pdf/);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
    expect(parts.saveWithPhotosAsync).not.toHaveBeenCalled();
  });

  it('refuses a save that leaves the part with no default photo, or with two', async () => {
    const {handler, documents} = setUp();

    await expect(handler.executeAsync(alice, 'p1', {photos: [{id: 'photo-a', isDefault: false}]}, [])).rejects.toThrow(
      /exactly one default/,
    );
    await expect(
      handler.executeAsync(alice, 'p1', {newPhotos: [{isDefault: true}]}, [jpeg('second-default.jpg')]),
    ).rejects.toThrow(/exactly one default/);
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
  });

  it('refuses a photo id that is not a photo of this part', async () => {
    const {handler} = setUp();

    await expect(
      handler.executeAsync(alice, 'p1', {photos: [{id: 'someone-elses', isDefault: true}]}, []),
    ).rejects.toThrow(/not a photo of this part/);
  });

  it('deletes the photos already uploaded when a later upload fails, and saves nothing', async () => {
    const {handler, parts, documents} = setUp([]);
    vi.mocked(documents.uploadDocumentAsync)
      .mockResolvedValueOnce({id: 'doc-first', status: 'Pending'})
      .mockRejectedValueOnce(new ServiceUnavailableException('document-api is down'));

    await expect(
      handler.executeAsync(alice, 'p1', {newPhotos: [{isDefault: true}, {isDefault: false}]}, [
        jpeg('one.jpg'),
        jpeg('two.jpg'),
      ]),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(documents.deleteDocumentAsync).toHaveBeenCalledWith(alice, 'doc-first');
    expect(parts.saveWithPhotosAsync).not.toHaveBeenCalled();
  });

  it('deletes every uploaded photo when the save itself fails', async () => {
    const {handler, parts, documents} = setUp([]);
    vi.mocked(parts.saveWithPhotosAsync).mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      handler.executeAsync(alice, 'p1', {newPhotos: [{isDefault: true}, {isDefault: false}]}, [
        jpeg('one.jpg'),
        jpeg('two.jpg'),
      ]),
    ).rejects.toThrow('connection lost');
    expect(vi.mocked(documents.deleteDocumentAsync).mock.calls.map((call) => call[1])).toEqual([
      'doc-new-1',
      'doc-new-2',
    ]);
  });
});
