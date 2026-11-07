import { Inject, Injectable } from "@nestjs/common";
import type { IMarkPartPhotoReadyCommandHandler } from "#business-logic-abstractions/handlers/parts/mark-photo-ready/mark-part-photo-ready.command-handler.interface";
import { UnhandledMessageError } from "#business-logic-abstractions/messaging/unhandled-message.error";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { DocumentProcessedMessageDto, MessageEnvelopeDto } from "#dto/messages/document-messages.dto";
import { processedMessages } from "#persistence/schema/processed-messages";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { PART_PHOTO_OWNER_TYPE } from "../part-photo.rules";
import { recordPhotoOutcomeAsync } from "../photo-outcome";

/** document-api finished a document: if it is a part photo, mark the photo ready. Safe to receive twice. */
@Injectable()
export class MarkPartPhotoReadyCommandHandler implements IMarkPartPhotoReadyCommandHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public async executeAsync(message: MessageEnvelopeDto<DocumentProcessedMessageDto>): Promise<void> {
    const { data } = message;
    if (data.ownerType !== PART_PHOTO_OWNER_TYPE) {
      throw new UnhandledMessageError(`dealership-api does not handle documents owned by '${data.ownerType}'.`);
    }
    const now = this._clock.now();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // The inbox row and the photo update commit together; a redelivered message hits the conflict and stops here.
    const [first] = await work.db
      .insert(processedMessages)
      .values({ messageId: message.messageId, processedAt: now })
      .onConflictDoNothing()
      .returning();
    if (!first) {
      return;
    }
    await recordPhotoOutcomeAsync(
      work.db,
      { dealerId: data.dealerId, documentId: data.documentId, status: "ready", failureReason: null },
      now,
    );
    await work.commitAsync();
  }
}
