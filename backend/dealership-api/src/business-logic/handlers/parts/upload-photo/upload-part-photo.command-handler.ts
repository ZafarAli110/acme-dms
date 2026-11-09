import { localized } from "#i18n/messages";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { IUploadPartPhotoCommandHandler } from "#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface";
import {
  DOCUMENT_API_CLIENT,
  type IDocumentApiClient,
} from "#business-logic-abstractions/rest-clients/document-api.client.interface";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { PartPhotoResponseDto } from "#dto/parts/part-photo-response.dto";
import type { PartPhotoUploadRequestDto } from "#dto/parts/part-photo-upload-request.dto";
import { partPhotos } from "#persistence/schema/part-photos";
import { parts } from "#persistence/schema/parts";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { createdAudit, updatedAudit } from "../../../audit/audit-fields";
import { toPartPhotoResponseDto } from "../part.mapper";
import { findPhotosAsync } from "../part.queries";
import { applyEarlyOutcomesAsync } from "../photo-outcome";
import {
  MAX_PHOTOS_PER_PART,
  PART_PHOTO_OWNER_TYPE,
  PART_PHOTO_VARIANTS,
  validatePhotoFile,
} from "../part-photo.rules";

/**
 * Validates the photo, hands it to document-api for storage and processing, and records the reference as pending.
 * The photo becomes ready (or failed) later, when document-api's document.processed / document.failed event arrives.
 */
@Injectable()
export class UploadPartPhotoCommandHandler implements IUploadPartPhotoCommandHandler {
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
    request: PartPhotoUploadRequestDto,
  ): Promise<PartPhotoResponseDto> {
    validatePhotoFile(request);
    const existingCount = await this.countPhotosAsync(partId);
    if (existingCount >= MAX_PHOTOS_PER_PART) {
      throw new BadRequestException(localized("errors.tooManyPhotos", { max: MAX_PHOTOS_PER_PART }));
    }

    // Outside any transaction: another service stores the file.
    const document = await this._documentApiClient.uploadDocumentAsync(userContext, {
      ownerType: PART_PHOTO_OWNER_TYPE,
      ownerId: partId,
      fileName: request.fileName,
      contentType: request.contentType,
      content: request.content,
      variants: PART_PHOTO_VARIANTS,
    });

    try {
      return await this.savePhotoAsync(userContext, partId, request, document.id);
    } catch (error) {
      // The photo was not saved: its file is nobody's. Best effort; a failure to delete is only logged by the client.
      await this._documentApiClient.deleteDocumentAsync(userContext, document.id).catch(() => null);
      throw error;
    }
  }

  /**
   * Saves the photo with the part locked, so uploads to one part take turns: the count and the default are read
   * again under the lock (the first count, before the upload, only spares a needless upload). Applies anything
   * document-api already said about the document.
   *
   * The part's version goes up, as with any change to its photos: a save from a form opened before this upload keeps
   * the photos that form knew, and without a new version it removed this one, with no 412 (the state sweep's F1).
   */
  private async savePhotoAsync(
    userContext: UserContext,
    partId: string,
    request: PartPhotoUploadRequestDto,
    documentId: string,
  ): Promise<PartPhotoResponseDto> {
    const now = this._clock.now();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // Locks the part (uploads take turns) and moves its version, in one statement.
    await work.db
      .update(parts)
      .set({ version: sql`${parts.version} + 1`, ...updatedAudit(userContext.userId, now) })
      .where(eq(parts.id, partId));
    const count = (await findPhotosAsync(work.db, partId)).length;
    if (count >= MAX_PHOTOS_PER_PART) {
      throw new BadRequestException(localized("errors.tooManyPhotos", { max: MAX_PHOTOS_PER_PART }));
    }
    const [photo] = await work.db
      .insert(partPhotos)
      .values({
        dealerId: userContext.dealerId,
        partId,
        documentId,
        originalFileName: request.fileName,
        status: "pending",
        failureReason: null,
        isDefault: count === 0,
        ...createdAudit(userContext.userId, now),
      })
      .returning();
    await applyEarlyOutcomesAsync(work.db, [documentId], now);
    const [saved] = await work.db.select().from(partPhotos).where(eq(partPhotos.id, photo!.id));
    await work.commitAsync();
    return toPartPhotoResponseDto(saved!);
  }

  /** How many photos the part has; a part that doesn't exist is not found. */
  private async countPhotosAsync(partId: string): Promise<number> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const [part] = await work.db
      .select({ id: parts.id })
      .from(parts)
      .where(and(eq(parts.id, partId)));
    if (!part) {
      throw new NotFoundException(localized("errors.partNotFound", { partId }));
    }
    return (await findPhotosAsync(work.db, partId)).length;
  }
}
