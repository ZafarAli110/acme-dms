import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {createdAudit} from '../../../audit/audit-fields';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {IUploadPartPhotoCommandHandler} from '#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface';
import {
  DOCUMENT_API_CLIENT,
  type IDocumentApiClient,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoResponseDto} from '#dto/parts/part-photo-response.dto';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {PartPhoto} from '#persistence/entities/part-photo.entity';
import {
  type IPartPhotoRepository,
  PART_PHOTO_REPOSITORY,
} from '#persistence/repositories/part-photo.repository.interface';
import {type IPartRepository, PART_REPOSITORY} from '#persistence/repositories/part.repository.interface';
import {toPartPhotoResponseDto} from '../part.mapper';
import {MAX_PHOTOS_PER_PART, PART_PHOTO_OWNER_TYPE, PART_PHOTO_VARIANTS, validatePhotoFile} from '../part-photo.rules';

/**
 * Validates the photo, hands it to document-api for storage and processing, and records the reference as pending.
 * The photo becomes ready (or failed) later, when document-api's document.processed / document.failed event arrives.
 */
@Injectable()
export class UploadPartPhotoCommandHandler implements IUploadPartPhotoCommandHandler {
  private readonly _partRepository: IPartRepository;
  private readonly _partPhotoRepository: IPartPhotoRepository;
  private readonly _documentApiClient: IDocumentApiClient;
  private readonly _clock: IClock;

  public constructor(
    @Inject(PART_REPOSITORY) partRepository: IPartRepository,
    @Inject(PART_PHOTO_REPOSITORY) partPhotoRepository: IPartPhotoRepository,
    @Inject(DOCUMENT_API_CLIENT) documentApiClient: IDocumentApiClient,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._partRepository = partRepository;
    this._partPhotoRepository = partPhotoRepository;
    this._documentApiClient = documentApiClient;
    this._clock = clock;
  }

  public async executeAsync(
    userContext: UserContext,
    partId: string,
    request: PartPhotoUploadRequestDto,
  ): Promise<PartPhotoResponseDto> {
    validatePhotoFile(request);

    const part = await this._partRepository.findByIdAsync(userContext.dealerId, partId);
    if (!part) {
      throw new NotFoundException(`Part ${partId} was not found.`);
    }
    const existing = await this._partPhotoRepository.findForPartAsync(userContext.dealerId, partId);
    if (existing.length >= MAX_PHOTOS_PER_PART) {
      throw new BadRequestException(`A part can have at most ${MAX_PHOTOS_PER_PART} photos.`);
    }

    const document = await this._documentApiClient.uploadDocumentAsync(userContext, {
      ownerType: PART_PHOTO_OWNER_TYPE,
      ownerId: partId,
      fileName: request.fileName,
      contentType: request.contentType,
      content: request.content,
      variants: PART_PHOTO_VARIANTS,
    });

    const photo: PartPhoto = {
      id: crypto.randomUUID(),
      dealerId: userContext.dealerId,
      partId,
      documentId: document.id,
      originalFileName: request.fileName,
      status: 'pending' as const,
      failureReason: null,
      isDefault: existing.length === 0,
      ...createdAudit(userContext.userId, this._clock.now()),
    };
    await this._partPhotoRepository.saveAsync(userContext.dealerId, photo);
    return toPartPhotoResponseDto(photo);
  }
}
