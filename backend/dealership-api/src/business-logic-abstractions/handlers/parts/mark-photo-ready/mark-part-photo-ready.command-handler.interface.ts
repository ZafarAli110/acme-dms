import type {DocumentProcessedMessageDto, MessageEnvelopeDto} from '#dto/messages/document-messages.dto';

export interface IMarkPartPhotoReadyCommandHandler {
  executeAsync(message: MessageEnvelopeDto<DocumentProcessedMessageDto>): Promise<void>;
}

export const MARK_PART_PHOTO_READY_COMMAND_HANDLER = Symbol('IMarkPartPhotoReadyCommandHandler');
