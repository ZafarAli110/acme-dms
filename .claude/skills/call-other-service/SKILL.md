---
name: call-other-service
description: Calls another Acme service (document-api, identity-api) from dealership-api through a typed REST client - the interface, the generated types, the named HTTP client and its resilience preset, error translation and tests - keeping business logic in the handler. Use when a change needs another service to do or return something, or changes how one is called.
---

# Calling another service

The rule: `docs/standards/business-handlers.md`, "Calling another service: the client carries, the handler decides".
The working example is document-api's client: `src/rest-clients/document-api/document-api.client.ts`, its interface
in `src/business-logic-abstractions/rest-clients/`, and its caller `UpdatePartCommandHandler`.

```
handler                 decides: whether to call, with what, and what to do when it fails
   ↓ IDocumentApiClient   (business-logic-abstractions: our types, no HTTP)
client                  carries: one request, headers, the other service's types, resilience, error translation
   ↓ named HTTP client    (rest-clients.module.ts: base URL from settings, timeout, retries of idempotent calls)
the other service       makes its own permission and dealer checks with the user's token
```

## 1. The interface: our words, the other service's operations

In `business-logic-abstractions/rest-clients/<service>.client.interface.ts`: one method per operation the other
service offers, named for that operation (`uploadDocumentAsync`, `deleteDocumentAsync`), with our own command and
result types and an injection token. No HTTP types, no generated types: the handler must not know there is HTTP.

## 2. The generated types

The other service's request and response types come from its OpenAPI document, never written by hand:
`bun run generate:clients` in `backend/dealership-api` while the system runs. It writes
`<service>.openapi.json` (the contract we were built against) and `<service>.schema.d.ts`; commit both. A new service
needs its own entry in `scripts/generate-rest-clients.ts`.

## 3. The client: one method, one request

```ts
public async deleteDocumentAsync(userContext: UserContext, documentId: string): Promise<void> {
  try {
    await this._policy.execute(
      ({ signal }) => this._http.delete("/v1/documents/:documentId", { params: { documentId }, headers: headersFor(userContext), signal }),
      { source: "DocumentApiClient.deleteDocumentAsync" },
    );
  } catch (error) {
    if (error instanceof HttpResponseError && error.status === 404) {
      return; // Already gone: what an idempotent delete means.
    }
    throw toServiceException(`Document ${documentId} could not be deleted`, error);
  }
}
```

- Headers carry the user's token and location (`headersFor`), so the other service applies its own checks.
- Every call goes through the service's resilience preset (`this._policy.execute`) and passes its `signal` on.
- Failures go through `toServiceException`: a refusal (4xx) keeps the other service's reason; anything else (no
  answer, a timeout, a 5xx, an open circuit) is `503`, with the original error as the `cause`.

```ts
// ❌ business logic in the client: it knows about parts and defaults, and makes two requests
public async replaceDefaultPartPhotoAsync(userContext: UserContext, part: Part, file: Upload): Promise<void> {
  if (part.photos.length >= MAX_PHOTOS_PER_PART) { throw new BadRequestException("Too many photos"); }
  await this.deleteDocumentAsync(userContext, part.defaultPhoto.documentId);
  await this.uploadDocumentAsync(userContext, { ownerType: "part", … });
}

// ✅ the handler decides and orders; the client sends each request it is asked to
files.forEach(validatePhotoFile);
const document = await this._documentApiClient.uploadDocumentAsync(userContext, { ownerType: PART_PHOTO_OWNER_TYPE, … });
```

## 4. Registration

In `rest-clients.module.ts`: a named HTTP client (`HttpClientModule.registerAsync`, base URL from settings, a
timeout), a resilience preset of the same name in `REST_CLIENT_RESILIENCE_PRESETS` (a circuit breaker, no retries:
the HTTP client retries, so attempts never multiply), and the class bound to the interface's token in `CLIENTS`.
Never retry a call that is not idempotent (an upload would store the file twice).

## 5. Tests: transport in one place, decisions in the other

- **The client's test** (`rest-clients/<service>/__test__/`): with a fake `HttpClient`, check the request it sends
  (path, headers, body) and how it reads each kind of answer: success, a refusal with its reason, a `503` for no
  answer or an open circuit.
- **The handler's tests** use the fake client in `src/test-setup/` (`fakeDocumentApi()`), and check what the handler
  decides: what it uploads, what it deletes when the save fails, and that a refusal stops the save.

## Before calling it done

- [ ] Each client method sends one request and names an operation of the other service, not one of ours.
- [ ] The handler imports the interface, never the class (the lint rule says so too).
- [ ] No call to another service inside a transaction (`beginAsync()` … `commitAsync()`).
- [ ] Only idempotent calls retry; the preset has a circuit breaker and no retries of its own.
- [ ] The generated files are committed with the change that needed them.
