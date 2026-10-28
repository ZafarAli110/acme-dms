import {Injectable, ServiceUnavailableException} from '@nestjs/common';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {
  IDocumentApiClient,
  DocumentUploadCommand,
  UploadedDocument,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {components} from './document-api.schema';

type DocumentResponseDto = components['schemas']['DocumentResponseDto'];

/**
 * Calls document-api on behalf of the signed-in user: their access token and location travel with the request, so
 * document-api applies its own permission and dealer checks. Types come from document-api's OpenAPI document
 * (regenerate with `bun run generate:clients` after document-api's contract changes).
 */
@Injectable()
export class DocumentApiClient implements IDocumentApiClient {
  private readonly _baseUrl: string;

  public constructor() {
    const baseUrl = process.env['services__document-api__http__0'];
    if (!baseUrl) {
      throw new Error('services__document-api__http__0 is not set; dealership-api must run under Aspire.');
    }
    this._baseUrl = baseUrl;
  }

  public async uploadDocumentAsync(
    userContext: UserContext,
    command: DocumentUploadCommand,
  ): Promise<UploadedDocument> {
    const form = new FormData();
    form.append('file', new Blob([command.content.slice()], {type: command.contentType}), command.fileName);
    form.append('ownerType', command.ownerType);
    form.append('ownerId', command.ownerId);
    form.append('variants', JSON.stringify(command.variants));

    const response = await fetch(`${this._baseUrl}/v1/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userContext.accessToken}`,
        ...(userContext.locationId ? {'x-location-id': userContext.locationId} : {}),
      },
      body: form,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `document-api rejected the upload: ${response.status} ${await response.text()}`,
      );
    }
    const document = (await response.json()) as DocumentResponseDto;
    return {id: document.id, status: document.status};
  }

  public async deleteDocumentAsync(userContext: UserContext, documentId: string): Promise<void> {
    const response = await fetch(`${this._baseUrl}/v1/documents/${documentId}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${userContext.accessToken}`,
        ...(userContext.locationId ? {'x-location-id': userContext.locationId} : {}),
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `document-api could not delete document ${documentId}: ${response.status} ${await response.text()}`,
      );
    }
  }
}
