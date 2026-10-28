import {Inject, Injectable} from '@nestjs/common';
import {eq} from 'drizzle-orm';
import type {IMarkPartPhotoFailedCommandHandler} from '#business-logic-abstractions/handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler.interface';
import {UnhandledMessageError} from '#business-logic-abstractions/messaging/unhandled-message.error';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {SYSTEM_USER_ID} from '#business-logic-abstractions/user-context/system-user';
import type {DocumentFailedMessageDto, MessageEnvelopeDto} from '#dto/messages/document-messages.dto';
import {partPhotos, processedMessages} from '#persistence/schema/index';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {PART_PHOTO_OWNER_TYPE} from '../part-photo.rules';

/** document-api gave up on a document: if it is a part photo, mark the photo failed with the reason. Safe to receive twice. */
@Injectable()
export class MarkPartPhotoFailedCommandHandler implements IMarkPartPhotoFailedCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(message: MessageEnvelopeDto<DocumentFailedMessageDto>): Promise<void> {
    const {data} = message;
    if (data.ownerType !== PART_PHOTO_OWNER_TYPE) {
      throw new UnhandledMessageError(`dealership-api does not handle documents owned by '${data.ownerType}'.`);
    }
    const now = this._clock.now();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // The inbox row and the photo update commit together; a redelivered message hits the conflict and stops here.
    const [first] = await work.db
      .insert(processedMessages)
      .values({messageId: message.messageId, processedAt: now})
      .onConflictDoNothing()
      .returning();
    if (!first) {
      return;
    }
    await work.db
      .update(partPhotos)
      // Background work: no signed-in user, so the system is recorded as the one who changed the photo.
      .set({status: 'failed', failureReason: data.reason, updatedAt: now, updatedBy: SYSTEM_USER_ID})
      .where(eq(partPhotos.documentId, data.documentId));
    await work.commitAsync();
  }
}
