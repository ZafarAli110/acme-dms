import type {DocumentFailedMessageDto, MessageEnvelopeDto} from '#dto/messages/document-messages.dto';

export interface IMarkPartPhotoFailedCommandHandler {
  executeAsync(message: MessageEnvelopeDto<DocumentFailedMessageDto>): Promise<void>;
}

export const MARK_PART_PHOTO_FAILED_COMMAND_HANDLER = Symbol('IMarkPartPhotoFailedCommandHandler');
