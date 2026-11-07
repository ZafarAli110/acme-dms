import type { DocumentUnclaimedMessageDto } from "#dto/messages/document-messages.dto";

/** Injection token for the publisher of dealership-api's messages to document-api. */
export const DOCUMENT_MESSAGE_PUBLISHER = Symbol("DocumentMessagePublisher");

/** Sends messages to document-api through the broker: background work has no user token to call it with. */
export interface IDocumentMessagePublisher {
  /** Publishes `document.unclaimed.v1` for each, confirmed by the broker; throws when it cannot. */
  publishUnclaimedAsync(documents: DocumentUnclaimedMessageDto[]): Promise<void>;
}
