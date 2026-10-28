import type {UserContext} from '#business-logic-abstractions/user-context/user-context';

export interface DocumentVariantSpec {
  name: string;
  maxDimension: number;
  quality: number;
}

export interface DocumentUploadCommand {
  ownerType: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  content: Uint8Array;
  variants: DocumentVariantSpec[];
}

export interface UploadedDocument {
  id: string;
  status: string;
}

/** document-api, called on behalf of the signed-in user (their token and location are forwarded). */
export interface IDocumentApiClient {
  uploadDocumentAsync(userContext: UserContext, command: DocumentUploadCommand): Promise<UploadedDocument>;
  /** Deletes a document and its variants. A document that is already gone counts as deleted. */
  deleteDocumentAsync(userContext: UserContext, documentId: string): Promise<void>;
}

export const DOCUMENT_API_CLIENT = Symbol('IDocumentApiClient');
