# File uploads

Applies to every feature that accepts files (part photos today; profile photos, message attachments and work-order
documents later).

## Who does what

| Layer                              | Owns                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| Controller (the feature's service) | multipart parsing, transport limits (field name, one file, max bytes) |
| Command handler (the feature)      | allowed types, max size, max count per owner, metadata on the owner   |
| document-api                       | storing the original, producing variants, serving content             |
| document-api image processor       | images only: resize, re-encode as WebP. No validation.                |

## Rules

1. **Files are stored by document-api**, never by the feature's own service, filesystem or database. The feature keeps
   a reference (`documentId`) and a status (`pending` → `ready` | `failed`).
2. **Feature rules live in the feature's handler**: each feature decides its own types, size limit and count limit.
   document-api enforces only its own limits (20 MB, variants only for images).
3. **The feature decides the variants** (name, max dimension, quality) and sends them with the upload. Part photos use
   `display` (1200 px, quality 82) and `thumb` (150 px, quality 75).
4. **Processing is asynchronous.** The upload returns 202 with status `pending`; the feature updates the status when
   `document.processed.v1` or `document.failed.v1` arrives for its `ownerType`.
5. **Never use the original file name as a storage key** — keep it as metadata only.
6. **Images are fetched with the bearer token** (`GET /api/documents/v1/documents/{id}/content/{variant}`) and shown
   through an object URL in the web app (`DocumentImage`).

## Saving a record together with its files

When one request creates a record and its files (a car with its check-in photos), the user must never be left with half
of it: no record missing the files they attached, and no stored files that belong to no record.

1. **Validate everything before writing anything**: the record (including uniqueness checks) and every file (type,
   size, count). A request that fails validation stores nothing, in either service.
2. **Then upload the files** to document-api.
3. **Then save the record and its file references in one transaction.**
4. **If anything fails after the first upload**, delete the documents already uploaded before returning the error.

Editing a record with its files is one Save too: the changed fields, the files kept or removed, the default, and the
new files go in one multipart request, through the same four steps. Files removed by the save are deleted from
document-api only after it commits. (`PATCH /v1/parts/{id}`: a JSON `payload` field plus the new files as `photos`; see
`UpdatePartCommandHandler`.)

A separate endpoint that adds one file on its own (`POST /v1/parts/{id}/photos`, used by scripts) succeeds or fails on
its own; screens do not use it.

## Part photos

| Rule          | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Types         | JPEG, PNG, WebP, GIF, HEIC, HEIF                                                            |
| Max size      | 10 MB                                                                                       |
| Max per part  | 10                                                                                          |
| Default photo | exactly one while the part has photos; chosen on the part page (the first photo until then) |
| Permission    | `parts.write` to save the part page; `documents.write` for the one-photo endpoint           |

## Adding uploads to a new feature (checklist)

- [ ] Allowed types, size and count as constants in the feature's command handler.
- [ ] A new `ownerType` value, sent with the upload.
- [ ] A reference table with `document_id` and `status` on the owning side.
- [ ] **Handle `document.processed.v1` and `document.failed.v1` for the new `ownerType`** — otherwise those events are
      dead-lettered and the status stays `pending` for ever.
- [ ] `accept=` on the file input in the web app; image display through `DocumentImage`.
