import {BadRequestException, Inject, Injectable, Logger, NotFoundException} from '@nestjs/common';
import {and, eq, inArray} from 'drizzle-orm';
import type {IUpdatePartCommandHandler} from '#business-logic-abstractions/handlers/parts/update/update-part.command-handler.interface';
import {
  DOCUMENT_API_CLIENT,
  type IDocumentApiClient,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import type {PartUpdateRequestDto} from '#dto/parts/part-update-request.dto';
import {type NewPartPhoto, partPhotos, parts} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit, updatedAudit} from '../../../audit/audit-fields';
import {requireLocation} from '../../../user-context/require-location';
import {toPartResponseDto} from '../part.mapper';
import {findPhotosAsync, findStockedPartAsync} from '../part.queries';
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
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _documentApiClient: IDocumentApiClient;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(DOCUMENT_API_CLIENT) documentApiClient: IDocumentApiClient,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
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
    // PATCH: a field that was not sent (undefined) is left as it is.
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
    const {existing} = await this.readPartAsync(locationId, partId);
    if (newPhotos.length !== files.length) {
      throw new BadRequestException(
        `Send one newPhotos entry per photo file: ${newPhotos.length} entries, ${files.length} files.`,
      );
    }
    files.forEach(validatePhotoFile);

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
      const addedPhotos: NewPartPhoto[] = [];
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
        addedPhotos.push({
          partId,
          documentId: document.id,
          originalFileName: file.fileName,
          status: 'pending',
          failureReason: null,
          isDefault: newPhotos[index]?.isDefault ?? false,
          ...createdAudit(userContext.userId, now),
        });
      }

      // 3. The part and every photo change in one transaction.
      await using work = await this._unitOfWorkFactory.beginAsync();
      await work.db
        .update(parts)
        .set({
          ...(request.description === undefined ? {} : {description: request.description}),
          ...(request.unitPrice === undefined ? {} : {unitPrice: request.unitPrice}),
          ...updatedAudit(userContext.userId, now),
        })
        .where(eq(parts.id, partId));
      if (removed.length > 0) {
        // Soft delete: the row stays, marked deleted, so who removed which photo and when is never lost.
        await work.db
          .update(partPhotos)
          .set({
            isDeleted: true,
            deletedAt: now,
            deletedBy: userContext.userId,
            ...updatedAudit(userContext.userId, now),
          })
          .where(
            and(
              eq(partPhotos.partId, partId),
              inArray(
                partPhotos.id,
                removed.map((photo) => photo.id),
              ),
            ),
          );
      }
      for (const photo of kept) {
        await work.db
          .update(partPhotos)
          .set({isDefault: photo.isDefault, ...updatedAudit(userContext.userId, now)})
          .where(and(eq(partPhotos.partId, partId), eq(partPhotos.id, photo.id)));
      }
      if (addedPhotos.length > 0) {
        await work.db.insert(partPhotos).values(addedPhotos);
      }
      await work.commitAsync();
    } catch (error) {
      await this.deleteDocumentsAsync(userContext, uploadedDocumentIds);
      throw error;
    }

    // 4. The save is committed: the removed photos' files can go.
    await this.deleteDocumentsAsync(
      userContext,
      removed.map((photo) => photo.documentId),
    );

    const {stocked, existing: photos} = await this.readPartAsync(locationId, partId);
    return toPartResponseDto(stocked.part, stocked.inventory, stocked.bin, photos);
  }

  /** The part as this location stocks it, with its photos; a part the location doesn't stock is not found. */
  private async readPartAsync(locationId: string, partId: string) {
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const stocked = await findStockedPartAsync(work.db, locationId, partId);
    if (!stocked) {
      throw new NotFoundException(`Part ${partId} is not stocked at this location.`);
    }
    return {stocked, existing: await findPhotosAsync(work.db, partId)};
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
