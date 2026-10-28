import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {and, eq} from 'drizzle-orm';
import type {IUploadPartPhotoCommandHandler} from '#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface';
import {
  DOCUMENT_API_CLIENT,
  type IDocumentApiClient,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartPhotoResponseDto} from '#dto/parts/part-photo-response.dto';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import {notDeleted, partPhotos, parts} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {createdAudit} from '../../../audit/audit-fields';
import {toPartPhotoResponseDto} from '../part.mapper';
import {findPhotosAsync} from '../part.queries';
import {MAX_PHOTOS_PER_PART, PART_PHOTO_OWNER_TYPE, PART_PHOTO_VARIANTS, validatePhotoFile} from '../part-photo.rules';

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
      throw new BadRequestException(`A part can have at most ${MAX_PHOTOS_PER_PART} photos.`);
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

    await using work = await this._unitOfWorkFactory.beginAsync();
    const [photo] = await work.db
      .insert(partPhotos)
      .values({
        partId,
        documentId: document.id,
        originalFileName: request.fileName,
        status: 'pending',
        failureReason: null,
        isDefault: existingCount === 0,
        ...createdAudit(userContext.userId, this._clock.now()),
      })
      .returning();
    await work.commitAsync();
    return toPartPhotoResponseDto(photo!);
  }

  /** How many photos the part has; a part that doesn't exist is not found. */
  private async countPhotosAsync(partId: string): Promise<number> {
    await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
    const [part] = await work.db
      .select({id: parts.id})
      .from(parts)
      .where(and(eq(parts.id, partId), notDeleted(parts)));
    if (!part) {
      throw new NotFoundException(`Part ${partId} was not found.`);
    }
    return (await findPhotosAsync(work.db, partId)).length;
  }
}
