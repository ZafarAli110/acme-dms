import {Inject, Injectable} from '@nestjs/common';
import type {IMarkPartPhotoFailedCommandHandler} from '#business-logic-abstractions/handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {SYSTEM_USER_ID} from '#business-logic-abstractions/user-context/system-user';
import {UnhandledMessageError} from '#business-logic-abstractions/messaging/unhandled-message.error';
import type {DocumentFailedMessageDto, MessageEnvelopeDto} from '#dto/messages/document-messages.dto';
import {
  type IPartPhotoRepository,
  PART_PHOTO_REPOSITORY,
} from '#persistence/repositories/part-photo.repository.interface';
import {PART_PHOTO_OWNER_TYPE} from '../part-photo.rules';

/** document-api gave up on a document: if it is a part photo, mark the photo failed with the reason. */
@Injectable()
export class MarkPartPhotoFailedCommandHandler implements IMarkPartPhotoFailedCommandHandler {
  private readonly _partPhotoRepository: IPartPhotoRepository;
  private readonly _clock: IClock;

  public constructor(
    @Inject(PART_PHOTO_REPOSITORY) partPhotoRepository: IPartPhotoRepository,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._partPhotoRepository = partPhotoRepository;
    this._clock = clock;
  }

  public async executeAsync(message: MessageEnvelopeDto<DocumentFailedMessageDto>): Promise<void> {
    const {data} = message;
    if (data.ownerType !== PART_PHOTO_OWNER_TYPE) {
      throw new UnhandledMessageError(`dealership-api does not handle documents owned by '${data.ownerType}'.`);
    }
    await this._partPhotoRepository.updateStatusOnceAsync(
      message.messageId,
      data.dealerId,
      data.documentId,
      'failed',
      data.reason,
      // Background work: no signed-in user, so the system is recorded as the one who changed the photo.
      {at: this._clock.now(), by: SYSTEM_USER_ID},
    );
  }
}
