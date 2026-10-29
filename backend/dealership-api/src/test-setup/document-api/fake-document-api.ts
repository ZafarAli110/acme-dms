import {vi} from 'vitest';
import type {IDocumentApiClient} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';

/** document-api is another service: its client is faked, and records what was uploaded and deleted. */
export function fakeDocumentApi() {
  const uploadDocumentAsync = vi.fn(() => Promise.resolve({id: crypto.randomUUID(), status: 'Pending'}));
  const deleteDocumentAsync = vi.fn(() => Promise.resolve());
  const client = {uploadDocumentAsync, deleteDocumentAsync} satisfies IDocumentApiClient;
  return {client, uploadDocumentAsync, deleteDocumentAsync};
}

export function jpeg(fileName: string): PartPhotoUploadRequestDto {
  return {fileName, contentType: 'image/jpeg', sizeBytes: 1000, content: new Uint8Array([1])};
}
