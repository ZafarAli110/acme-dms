---
name: save-record-with-files
description: Saves a record together with its files (photos, documents) as one unit, through document-api. Use when a ticket attaches files to a record, such as a car's check-in photos or a part's photos.
---

# Save a record together with its files

Read `docs/standards/file-uploads.md` in full before starting, then `docs/standards/messaging.md` "Done means
processed". The reference is the part edit: `UpdatePartCommandHandler`
(`backend/dealership-api/src/business-logic/handlers/parts/update/`) behind `PATCH /v1/parts/{id}`.

## The request

One multipart request per Save: a JSON `payload` field (read with the `@JsonPayload` decorator, validated like any
request DTO) and the new files as one repeated field. Not a JSON create followed by uploads, and not one request per
file.

## The handler, in this order

1. **Validate everything before writing anything:** the record, its uniqueness checks, and every file (type, size,
   count, as constants in the handler). A failure here stores nothing anywhere.
2. Upload the files to document-api, with the feature's `ownerType`.
3. Save the record and its file references in **one transaction**.
4. If anything fails after the first upload, delete the uploaded documents before returning the error.

## The checklist from the standard (all of it)

- [ ] Allowed types, size and count as constants in the command handler.
- [ ] A new `ownerType` value, sent with the upload.
- [ ] A reference table with `document_id` and `status`; audit columns and soft delete (`database.md`).
- [ ] `document.processed.v1` **and** `document.failed.v1` handled for the new `ownerType`
      (`service/consumers/document-events.consumer.ts`). Without it the status stays `pending` for ever.
- [ ] `accept=` on the file input; images shown with `DocumentImage`.

## Prove it

- Save with files: the files reach `ready` (poll the record; check `bun run errors` and the RabbitMQ dead-letter
  queues).
- Save with an invalid record and files: count the documents before and after; nothing new was stored.
- Stop document-api and save: no record without its files.
