# Message contracts

Services talk asynchronously through RabbitMQ. Messages are plain JSON so the TypeScript and .NET services read each
other's messages without sharing code.

## Envelope

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

- `messageId` is unique per message. Consumers record it to ignore redeliveries (see `docs/standards/messaging.md`).
- `type` is also the RabbitMQ routing key. A breaking change to `data` means a new version: `…v2`, never an edit to `v1`.
- The W3C trace context travels in the AMQP headers, so a trace continues across the broker.

## Exchanges and queues

| Exchange             | Kind  | Purpose                                            |
| -------------------- | ----- | -------------------------------------------------- |
| `acme.documents`     | topic | document-api's work items and events               |
| `acme.documents.dlx` | topic | dead letters: messages a consumer could not handle |

| Queue                            | Consumer       | Bound to                                      |
| -------------------------------- | -------------- | --------------------------------------------- |
| `document-api.process-document`  | document-api   | `document.process.v1`                         |
| `dealership-api.document-events` | dealership-api | `document.processed.v1`, `document.failed.v1` |
| `*.dlq`                          | (people)       | the dead letters of the queue with that name  |

## Messages

### `document.process.v1` (document-api → itself)

A work item: produce the variants of one uploaded document.

```json
{"documentId": "uuid", "dealerId": "uuid"}
```

### `document.processed.v1` (document-api → anyone)

```json
{
  "documentId": "uuid",
  "dealerId": "uuid",
  "ownerType": "part",
  "ownerId": "uuid",
  "variants": [{"name": "display", "contentType": "image/webp", "width": 1200, "height": 800, "sizeBytes": 2002}]
}
```

### `document.failed.v1` (document-api → anyone)

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
