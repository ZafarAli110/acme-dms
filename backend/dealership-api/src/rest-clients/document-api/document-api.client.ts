import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {HttpClient, HttpResponseError, InjectHttpClient} from '@nestjs/http-client';
import {type ResiliencePolicy, ResilienceService} from '@nestjs/resilience';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {
  IDocumentApiClient,
  DocumentUploadCommand,
  UploadedDocument,
} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {components} from './document-api.schema';

type DocumentResponseDto = components['schemas']['DocumentResponseDto'];

/** The name of document-api's HTTP client and resilience preset (rest-clients.module.ts). */
export const DOCUMENT_API = 'document-api';

const UNAVAILABLE = 'The documents service is unavailable. Try again shortly.';

/**
 * Calls document-api on behalf of the signed-in user: their access token and location travel with the request, so
 * document-api applies its own permission and dealer checks. Types come from document-api's OpenAPI document
 * (regenerate with `bun run generate:clients` after document-api's contract changes).
 *
 * Every call runs through the `document-api` resilience preset (a circuit breaker). The HTTP client retries the
 * delete (idempotent) but never the upload, which would store the file twice.
 */
@Injectable()
export class DocumentApiClient implements IDocumentApiClient {
  private readonly _http: HttpClient;
  private readonly _policy: ResiliencePolicy;

  public constructor(@InjectHttpClient(DOCUMENT_API) http: HttpClient, resilience: ResilienceService) {
    this._http = http;
    this._policy = resilience.preset(DOCUMENT_API);
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

    try {
      const {data} = await this._policy.execute(
        ({signal}) =>
          this._http.post<DocumentResponseDto>('/v1/documents', {body: form, headers: headersFor(userContext), signal}),
        {source: 'DocumentApiClient.uploadDocumentAsync'},
      );
      return {id: data.id, status: data.status};
    } catch (error) {
      throw toServiceException(`${command.fileName} could not be stored`, error);
    }
  }

  public async deleteDocumentAsync(userContext: UserContext, documentId: string): Promise<void> {
    try {
      await this._policy.execute(
        ({signal}) =>
          this._http.delete('/v1/documents/:documentId', {
            params: {documentId},
            headers: headersFor(userContext),
            signal,
          }),
        {source: 'DocumentApiClient.deleteDocumentAsync'},
      );
    } catch (error) {
      if (error instanceof HttpResponseError && error.status === 404) {
        return; // Already gone: what the caller wanted.
      }
      throw toServiceException(`Document ${documentId} could not be deleted`, error);
    }
  }
}

function headersFor(userContext: UserContext): Record<string, string | null> {
  return {authorization: `Bearer ${userContext.accessToken}`, 'x-location-id': userContext.locationId};
}

/**
 * What the caller of this service is told when document-api did not do what was asked. A refusal (4xx) keeps
 * document-api's own reason, which is written for users; anything else (no answer, a timeout, a 5xx, an open circuit)
 * is "unavailable". The original error is the `cause`, so the log shows the whole chain.
 */
export function toServiceException(what: string, error: unknown): HttpException {
  if (error instanceof HttpResponseError && isRefusal(error.status)) {
    const message = `${what}: ${problemDetail(error) ?? error.statusText}`;
    if (error.status === 401 || error.status === 403) {
      return new ForbiddenException(message, {cause: error});
    }
    if (error.status === 409) {
      return new ConflictException(message, {cause: error});
    }
    return new BadRequestException(message, {cause: error});
  }
  return new ServiceUnavailableException(`${what}. ${UNAVAILABLE}`, {cause: error});
}

/** A 4xx other than "slow down" (408 timeout, 429 too many requests): the request itself was refused. */
function isRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function problemDetail(error: HttpResponseError): string | null {
  const body = error.body as {detail?: unknown} | null;
  return typeof body?.detail === 'string' ? body.detail : null;
}
