import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {HttpClient, HttpNetworkError, HttpResponseError} from '@nestjs/http-client';
import {CircuitOpenError, type ResiliencePolicy, ResilienceService} from '@nestjs/resilience';
import {describe, expect, it, vi} from 'vitest';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {DocumentApiClient} from '../document-api.client';

const alice: UserContext = {
  userId: 'alice',
  dealerId: 'northwind',
  locationId: 'northside',
  permissions: ['parts.write'],
  accessToken: 'token',
};

const upload = {
  ownerType: 'part-photo',
  ownerId: 'part-1',
  fileName: 'pads.jpg',
  contentType: 'image/jpeg',
  content: new Uint8Array([1, 2, 3]),
  variants: [],
};

/** A policy that just runs the call once, as the circuit breaker does while it is closed. */
const passThrough = {
  execute: (call: (context: {signal: AbortSignal; attempt: number}) => unknown) =>
    Promise.resolve(call({signal: new AbortController().signal, attempt: 1})),
} as unknown as ResiliencePolicy;

function client(http: Partial<HttpClient>, policy: ResiliencePolicy = passThrough): DocumentApiClient {
  const resilience = {preset: vi.fn().mockReturnValue(policy)} as unknown as ResilienceService;
  return new DocumentApiClient(http as HttpClient, resilience);
}

function refusal(status: number, detail: string): HttpResponseError {
  return new HttpResponseError({method: 'POST', url: '/v1/documents', status, body: {detail}});
}

describe('DocumentApiClient', () => {
  it('sends the user token and location, and returns the stored document', async () => {
    const post = vi.fn().mockResolvedValue({data: {id: 'doc-1', status: 'pending'}});

    const document = await client({post} as unknown as Partial<HttpClient>).uploadDocumentAsync(alice, upload);

    expect(document).toEqual({id: 'doc-1', status: 'pending'});
    expect(post).toHaveBeenCalledWith(
      '/v1/documents',
      expect.objectContaining({headers: {authorization: 'Bearer token', 'x-location-id': 'northside'}}),
    );
  });

  it("passes document-api's refusal on as a 400 with its reason, keeping the original as the cause", async () => {
    const original = refusal(400, 'Only JPEG, PNG, WebP, GIF or HEIC images are accepted.');
    const post = vi.fn().mockRejectedValue(original);

    const failure = await client({post} as unknown as Partial<HttpClient>)
      .uploadDocumentAsync(alice, upload)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BadRequestException);
    expect((failure as Error).message).toBe(
      'pads.jpg could not be stored: Only JPEG, PNG, WebP, GIF or HEIC images are accepted.',
    );
    expect((failure as Error).cause).toBe(original);
  });

  it.each([
    ['no answer', new HttpNetworkError({method: 'POST', url: '/v1/documents', cause: new Error('ECONNREFUSED')})],
    ['a server error', refusal(500, 'boom')],
    ['an open circuit', new CircuitOpenError('document-api', 30_000)],
  ])('answers %s with 503, keeping the original as the cause', async (_case, original) => {
    const post = vi.fn().mockRejectedValue(original);

    const failure = await client({post} as unknown as Partial<HttpClient>)
      .uploadDocumentAsync(alice, upload)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).cause).toBe(original);
  });

  it('treats deleting a document that is already gone as done', async () => {
    const remove = vi.fn().mockRejectedValue(refusal(404, 'Document doc-1 was not found.'));

    await expect(
      client({delete: remove} as unknown as Partial<HttpClient>).deleteDocumentAsync(alice, 'doc-1'),
    ).resolves.toBeUndefined();
  });
});
