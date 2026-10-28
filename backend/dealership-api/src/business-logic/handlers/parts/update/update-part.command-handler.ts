import {BadRequestException, Inject, Injectable, Logger, NotFoundException} from '@nestjs/common';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IUpdatePartCommandHandler} from '#business-logic-abstractions/handlers/parts/update/update-part.command-handler.interface';
import {
  DOCUMENT_API_CLIENT,
  type IDocumentApiClient,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import type {PartUpdateRequestDto} from '#dto/parts/part-update-request.dto';
import type {NewEntity} from '#persistence/entities/generated-id';
import type {PartPhoto} from '#persistence/entities/part-photo.entity';
import {
  type IPartInventoryRepository,
  PART_INVENTORY_REPOSITORY,
} from '#persistence/repositories/part-inventory.repository.interface';
import {
  type IPartPhotoRepository,
  PART_PHOTO_REPOSITORY,
} from '#persistence/repositories/part-photo.repository.interface';
import {type IPartRepository, PART_REPOSITORY} from '#persistence/repositories/part.repository.interface';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';
import {MAX_PHOTOS_PER_PART, PART_PHOTO_OWNER_TYPE, PART_PHOTO_VARIANTS, validatePhotoFile} from '../part-photo.rules';

/**
 * Saves a part and its photos as one unit (docs/standards/file-uploads.md, "Saving a record together with its files"):
 * everything is validated before anything is written; then the new photos go to document-api; then the part and the
 * photo changes are saved in one transaction. If anything fails after the first upload, the uploads are deleted again,
 * so the user never ends up with half a save. Photos removed by the save are deleted from document-api last.
 */
@Injectable()
export class UpdatePartCommandHandler implements IUpdatePartCommandHandler {
  private readonly _logger = new Logger(UpdatePartCommandHandler.name);
  private readonly _partRepository: IPartRepository;
  private readonly _partInventoryRepository: IPartInventoryRepository;
  private readonly _partPhotoRepository: IPartPhotoRepository;
  private readonly _documentApiClient: IDocumentApiClient;
  private readonly _clock: IClock;

  public constructor(
    @Inject(PART_REPOSITORY) partRepository: IPartRepository,
    @Inject(PART_INVENTORY_REPOSITORY) partInventoryRepository: IPartInventoryRepository,
    @Inject(PART_PHOTO_REPOSITORY) partPhotoRepository: IPartPhotoRepository,
    @Inject(DOCUMENT_API_CLIENT) documentApiClient: IDocumentApiClient,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._partRepository = partRepository;
    this._partInventoryRepository = partInventoryRepository;
    this._partPhotoRepository = partPhotoRepository;
    this._documentApiClient = documentApiClient;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    partId: string,
    request: PartUpdateRequestDto,
    files: PartPhotoUploadRequestDto[],
  ): Promise<PartResponseDto> {
    const newPhotos = request.newPhotos ?? [];
    if (
      request.description === undefined &&
      request.unitPrice === undefined &&
      request.photos === undefined &&
      newPhotos.length === 0
    ) {
      throw new BadRequestException('Send at least one change: description, unitPrice, photos or new photos.');
    }

    // 1. Validate everything before writing anything.
    const locationId = requireLocation(userContext);
    const part = await this._partRepository.findByIdAsync(userContext.dealerId, partId);
    const stocked = part
      ? await this._partInventoryRepository.findForPartAsync(userContext.dealerId, locationId, partId)
      : null;
    if (!part || !stocked) {
      throw new NotFoundException(`Part ${partId} is not stocked at this location.`);
    }
    if (newPhotos.length !== files.length) {
      throw new BadRequestException(
        `Send one newPhotos entry per photo file: ${newPhotos.length} entries, ${files.length} files.`,
      );
    }
    files.forEach(validatePhotoFile);

    const existing = await this._partPhotoRepository.findForPartAsync(userContext.dealerId, partId);
    const kept = request.photos ?? existing.map((photo) => ({id: photo.id, isDefault: photo.isDefault}));
    const unknown = kept.find((photo) => !existing.some((candidate) => candidate.id === photo.id));
    if (unknown) {
      throw new BadRequestException(`Photo ${unknown.id} is not a photo of this part.`);
    }
    const total = kept.length + newPhotos.length;
    if (total > MAX_PHOTOS_PER_PART) {
      throw new BadRequestException(
        `A part can have at most ${MAX_PHOTOS_PER_PART} photos; this save would leave ${total}.`,
      );
    }
    const defaults = [...kept, ...newPhotos].filter((photo) => photo.isDefault).length;
    if (total > 0 && defaults !== 1) {
      throw new BadRequestException(`Choose exactly one default photo; ${defaults} are marked as default.`);
    }
    const removed = existing.filter((photo) => !kept.some((keep) => keep.id === photo.id));

    // 2. Upload the new photos. From here on, a failure deletes what was uploaded.
    const now = this._clock.now();
    const uploadedDocumentIds: string[] = [];
    try {
      const addedPhotos: NewEntity<PartPhoto>[] = [];
      for (const [index, file] of files.entries()) {
        const document = await this._documentApiClient.uploadDocumentAsync(userContext, {
          ownerType: PART_PHOTO_OWNER_TYPE,
          ownerId: partId,
          fileName: file.fileName,
          contentType: file.contentType,
          content: file.content,
          variants: PART_PHOTO_VARIANTS,
        });
        uploadedDocumentIds.push(document.id);
        const photo: NewEntity<PartPhoto> = {
          dealerId: userContext.dealerId,
          partId,
          documentId: document.id,
          originalFileName: file.fileName,
          status: 'pending' as const,
          failureReason: null,
          isDefault: newPhotos[index]?.isDefault ?? false,
          ...createdAudit(userContext.userId, now),
        };
        addedPhotos.push(photo);
      }

      // 3. The part and every photo change in one transaction.
      if (request.description !== undefined) {
        part.description = request.description;
      }
      if (request.unitPrice !== undefined) {
        part.unitPrice = request.unitPrice;
      }
      part.updatedAt = now;
      part.updatedBy = userContext.userId;
      await this._partRepository.saveWithPhotosAsync(userContext.dealerId, part, {
        removedPhotoIds: removed.map((photo) => photo.id),
        deletedBy: userContext.userId,
        at: now,
        kept,
        addedPhotos,
      });
    } catch (error) {
      await this.deleteDocumentsAsync(userContext, uploadedDocumentIds);
      throw error;
    }

    // 4. The save is committed: the removed photos' files can go.
    await this.deleteDocumentsAsync(
      userContext,
      removed.map((photo) => photo.documentId),
    );

    const photos = await this._partPhotoRepository.findForPartAsync(userContext.dealerId, partId);
    return toPartResponseDto(part, stocked.inventory, stocked.bin, photos);
  }

  /** Best effort, all at once: a document left behind is logged, never turned into a failed save. */
  private async deleteDocumentsAsync(userContext: UserContext, documentIds: string[]): Promise<void> {
    const results = await Promise.allSettled(
      documentIds.map((documentId) => this._documentApiClient.deleteDocumentAsync(userContext, documentId)),
    );
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        this._logger.warn(
          `Document ${documentIds[index]} could not be deleted and is left without an owner: ${String(result.reason)}`,
        );
      }
    }
  }
}
