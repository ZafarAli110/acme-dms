# The file rows and their events

document-api answers an upload at once (`202`, status `pending`) and processes the file in the background. When it is
done it publishes `document.processed.v1` or `document.failed.v1` on the `acme.documents` exchange. dealership-api's
`DocumentEventsConsumer` (`service/consumers/document-events.consumer.ts`) receives both, and a business handler marks
the feature's row.

## The table

One row per file, on the owning side (`part_photos` is the example):

| Column                | Why                                                           |
| --------------------- | ------------------------------------------------------------- |
| `dealer_id`           | every business row says whose it is (`multi-tenancy.md`)      |
| `<owner>_id`          | the record the file belongs to                                |
| `document_id`         | the reference into document-api; never the file itself        |
| `status`              | `pending` → `ready` or `failed`                               |
| `failure_reason`      | what document-api said, shown to the user on `failed`         |
| `original_file_name`  | shown to the user; never a storage key or a path              |
| audit and soft delete | `createdAudit` / `updatedAudit`, `is_deleted` (`database.md`) |

Add it with a new migration; never edit one that is committed.

## The handlers

One command handler per event, in `business-logic/handlers/<feature>/mark-<thing>-ready/` and `…-failed/`
(`MarkPartPhotoReadyCommandHandler` is the example):

- **Check the owner first:** a document owned by another feature is not this handler's; throw `UnhandledMessageError`.
- **Once only:** insert the message id into `processed_messages` with `onConflictDoNothing()` in the same transaction
  as the update; a redelivered message finds the row and stops (`messaging.md`, "Done means processed").
- **Find the row by `dealer_id` and `document_id`** from the message; there is no signed-in user, so the dealer comes
  from the message and `updatedBy` is `SYSTEM_USER_ID`.

## The consumer

Today the consumer hands every processed event to the part photo handler, which refuses other owners. A second
feature must route by `data.ownerType` in `DocumentEventsConsumer.handleAsync`, so each feature's handler sees only its
own documents:

```ts
case DOCUMENT_PROCESSED: {
  const processed = envelope as MessageEnvelopeDto<DocumentProcessedMessageDto>;
  switch (processed.data.ownerType) {
    case PART_PHOTO_OWNER_TYPE:
      await this._markPartPhotoReady.executeAsync(processed);
      break;
    case CAR_PHOTO_OWNER_TYPE: // the new feature's
      await this._markCarPhotoReady.executeAsync(processed);
      break;
    default:
      throw new UnhandledMessageError(`No handler for documents owned by '${processed.data.ownerType}'.`);
  }
  break;
}
```

A message nobody handles is dead-lettered (`dealership-api.document-events.dlq`), not retried for ever. If a status
stays `pending`, look there first: `bun run errors`, then the RabbitMQ management UI.

## While it is pending

The page polls the record while any file is `pending` (`usePart`'s `refetchInterval`) and stops when none is, so the
user sees `ready` or `failed` without reloading.
