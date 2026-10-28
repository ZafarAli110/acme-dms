/** The RabbitMQ message envelope every Acme service uses (see contracts/README.md). */
export interface MessageEnvelopeDto<TData> {
  messageId: string;
  type: string;
  occurredAt: string;
  correlationId: string | null;
  data: TData;
}

export interface DocumentVariantMessageDto {
  name: string;
  contentType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export interface DocumentProcessedMessageDto {
  documentId: string;
  dealerId: string;
  ownerType: string;
  ownerId: string;
  variants: DocumentVariantMessageDto[];
}

export interface DocumentFailedMessageDto {
  documentId: string;
  dealerId: string;
  ownerType: string;
  ownerId: string;
  reason: string;
}

export const DOCUMENT_PROCESSED = 'document.processed.v1';
export const DOCUMENT_FAILED = 'document.failed.v1';
