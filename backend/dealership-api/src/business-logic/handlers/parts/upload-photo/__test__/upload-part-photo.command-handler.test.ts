import {BadRequestException} from '@nestjs/common';
import {describe, expect, it, vi} from 'vitest';
import {fixedClock} from '#business-logic/time/__test__/fixed-clock';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IDocumentApiClient} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {PartPhoto} from '#persistence/entities/part-photo.entity';
import type {Part} from '#persistence/entities/part.entity';
import type {IPartPhotoRepository} from '#persistence/repositories/part-photo.repository.interface';
import type {IPartRepository} from '#persistence/repositories/part.repository.interface';
import {MAX_PHOTOS_PER_PART, PART_PHOTO_VARIANTS} from '../../part-photo.rules';
import {UploadPartPhotoCommandHandler} from '../upload-part-photo.command-handler';

const alice: UserContext = {
  userId: 'alice',
  dealerId: 'northwind',
  locationId: 'northside',
  permissions: ['documents.write'],
  accessToken: 't',
};
const jpeg: PartPhotoUploadRequestDto = {
  fileName: 'pads.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  content: new Uint8Array([1]),
};

function setup(existingPhotos = 0) {
  const parts = {
    findByIdAsync: vi.fn().mockResolvedValue({id: 'p1', dealerId: 'northwind'} as Part),
  } as unknown as IPartRepository;
  const photos = {
    findForPartAsync: vi.fn().mockResolvedValue(Array.from({length: existingPhotos}, () => ({}) as PartPhoto)),
    saveAsync: vi.fn().mockImplementation((_dealerId, photo) => Promise.resolve(photo)),
  } as unknown as IPartPhotoRepository;
  const documents: IDocumentApiClient = {
    uploadDocumentAsync: vi.fn().mockResolvedValue({id: 'doc-1', status: 'Pending'}),
    deleteDocumentAsync: vi.fn().mockResolvedValue(undefined),
  };
  return {handler: new UploadPartPhotoCommandHandler(parts, photos, documents, fixedClock()), photos, documents};
}

describe('UploadPartPhotoCommandHandler', () => {
  it('sends the photo to document-api with the part photo variants and records it as pending', async () => {
    const {handler, documents} = setup();

    const photo = await handler.executeAsync(alice, 'p1', jpeg);

    expect(photo).toMatchObject({documentId: 'doc-1', status: 'pending', isDefault: true});
    expect(documents.uploadDocumentAsync).toHaveBeenCalledWith(
      alice,
      expect.objectContaining({ownerType: 'part', ownerId: 'p1', variants: PART_PHOTO_VARIANTS}),
    );
  });

  it('rejects a file type that is not an image', async () => {
    const {handler, documents} = setup();

    await expect(handler.executeAsync(alice, 'p1', {...jpeg, contentType: 'application/pdf'})).rejects.toThrow(
      BadRequestException,
    );
    expect(documents.uploadDocumentAsync).not.toHaveBeenCalled();
  });

  it('rejects an eleventh photo', async () => {
    const {handler} = setup(MAX_PHOTOS_PER_PART);

    await expect(handler.executeAsync(alice, 'p1', jpeg)).rejects.toThrow(BadRequestException);
  });
});
