# Contracts between services

What the services promise each other, over HTTP and over RabbitMQ. A contract is a JSON shape, not shared code: the
TypeScript and .NET services each own their types and keep them to the shape written here, and their tests check it.

## HTTP

Each service publishes its API as an OpenAPI document (`/openapi/v1.json` for .NET, `/swagger/json` for
dealership-api). A service that calls another generates its types from that document, as dealership-api does for
document-api (`src/rest-clients/document-api/document-api.schema.d.ts`), rather than sharing code.

### `GET /v1/system/health` (every service and the gateway)

The same shape everywhere, with every field always present. Aspire polls it to show each resource as Healthy.

```json
{ "service": "identity-api", "status": "ok", "version": "26.11.0", "databaseReachable": true }
```

| Field               | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `service`           | `gateway-api`, `identity-api`, `document-api` or `dealership-api`               |
| `status`            | `ok`, or `degraded` when the service cannot reach its database                  |
| `version`           | the product version, from the root `package.json`; the same for every service   |
| `databaseReachable` | whether the service's database answers (the gateway's is its sessions database) |

Anonymous: no token, no location. Each service's tests check the shape.

### `POST` and `DELETE /api/session` (the gateway, for the web app)

The web app's sign-in. Both need the header `X-Requested-With: acme-web` (403 without it).

- `POST` with `{ "email": "…", "password": "…" }`: `204` and the session cookie, `__Host-acme_session` (`acme_session` in
  local development): `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. Otherwise identity-api's own answer, unchanged
  (`400`, `401`, or `429` with `Retry-After`); `503` when identity-api cannot be reached or answers anything else. It
  ends the session the browser had.
- `DELETE`: always `204`, with the cookie removed and `Clear-Site-Data: "cache"`.

With the cookie, a request to `/api/…` reaches the service with `Authorization: Bearer` and without the cookie. When the
session is gone the gateway answers `401` itself, with `X-Acme-Session: ended`: the only 401 that signs the page out.

## Messages

Services talk asynchronously through RabbitMQ. Messages are plain JSON so the TypeScript and .NET services read each
other's messages without sharing code.

### Envelope

Every message has the same envelope; `data` depends on `type`.

```json
{
  "messageId": "8f0c6a1e-0b6e-4f3f-9a77-2f3f1a6c9d10",
  "type": "document.processed.v1",
  "occurredAt": "2026-10-28T09:15:00.000Z",
  "correlationId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "data": {}
}
```

- `messageId` is unique per message. Consumers record it to ignore redeliveries.
- `type` is also the RabbitMQ routing key. A breaking change to `data` means a new version: `…v2`, never an edit to `v1`.
- The W3C trace context travels in the AMQP headers, so a trace continues across the broker.

### Exchanges and queues

| Exchange             | Kind  | Purpose                                            |
| -------------------- | ----- | -------------------------------------------------- |
| `acme.documents`     | topic | document-api's work items and events               |
| `acme.documents.dlx` | topic | dead letters: messages a consumer could not handle |

| Queue                                  | Consumer       | Bound to                                                                                                                             |
| -------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `document-api.process-document`        | document-api   | `document.process.v1`                                                                                                                |
| `dealership-api.document-events`       | dealership-api | `document.processed.v1`, `document.failed.v1`                                                                                        |
| `dealership-api.document-events.retry` | (none)         | a failed event waits 5 s, then goes back to `dealership-api.document-events` (default exchange); 5 tries, then the dead-letter queue |
| `*.dlq`                                | (people)       | the dead letters of the queue with that name                                                                                         |

### Message types

#### `document.process.v1` (document-api → itself)

A work item: produce the variants of one uploaded document.

```json
{ "documentId": "uuid", "dealerId": "uuid" }
```

#### `document.processed.v1` (document-api → anyone)

```json
{
  "documentId": "uuid",
  "dealerId": "uuid",
  "ownerType": "part",
  "ownerId": "uuid",
  "variants": [{ "name": "display", "contentType": "image/webp", "width": 1200, "height": 800, "sizeBytes": 2002 }]
}
```

#### `document.failed.v1` (document-api → anyone)

Published once processing has failed three times.

```json
{
  "documentId": "uuid",
  "dealerId": "uuid",
  "ownerType": "part",
  "ownerId": "uuid",
  "reason": "buffer is not in a known format"
}
```

`ownerType` says which service owns the document's meaning. A consumer that receives an owner type it does not know
must not guess: it dead-letters the message.
