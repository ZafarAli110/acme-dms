---
name: upload-files
description: Accepts files with a record (photos, documents, attachments) - the multipart endpoint, the feature's type, size and count rules, storage in document-api and its processed or failed events, and the web form that sends them. Use when a ticket uploads, attaches, replaces or removes a file, or shows an uploaded image.
---

# File uploads

A file is never stored by the feature that receives it. dealership-api checks it against the feature's rules, hands it
to **document-api**, and keeps a reference (`documentId`) and a status (`pending` → `ready` | `failed`) on its own row.
The standard behind this: `docs/standards/file-uploads.md`. The working example is the part edit: `PATCH /v1/parts/{id}`
→ `UpdatePartCommandHandler` (`backend/dealership-api/src/business-logic/handlers/parts/update/`).

## Who owns what

```
web form            FormData: a JSON `payload` field + the files, sent by the page's clientAction
   ↓
controller          multipart parsing and transport limits (MultipleFilesUpload), the payload validated (@JsonPayload(schema))
   ↓
command handler     the feature's rules (types, size, count), then upload → save → clean up
   ↓
document-api        stores the original, makes the variants the feature asked for, sends processed / failed
   ↓
events consumer     marks the feature's row ready or failed
```

Only the command handler knows the feature's rules. The interceptor's limits are a guardrail against huge requests,
not the rules; document-api enforces only its own (20 MB, variants for images only).

## The controller

```ts
@Patch(":partId")
@RequirePermission("parts.write")
@UseInterceptors(MultipleFilesUpload("photos", MAX_UPLOAD_FILES, MAX_UPLOAD_BYTES))
@ApiConsumes("multipart/form-data")
public updateAsync(
  @CurrentUser() userContext: UserContext,
  @Param("partId", ParseUUIDPipe) partId: string,
  @JsonPayload(PartUpdateRequestSchema) request: PartUpdateRequestDto, // validated like a JSON body
  @UploadedFiles() files: UploadedFileLike[] | undefined,
): Promise<PartResponseDto> {
  return this._handler.executeAsync(userContext, partId, request, (files ?? []).map(toUploadRequest));
}
```

- One request per Save: the record's fields as a JSON `payload` field, the files as one repeated field. Never a JSON
  save followed by one upload per file: the user could be left with half a save.
- `@JsonPayload(Schema)`, never `JSON.parse` by hand: multipart skips the global validation pipe, and the decorator puts
  it back (the same schema rules and messages, unknown properties refused).
- The file name goes through `uploadedFileName(file)`: the parser reads names as Latin-1 and garbles accents.

## The feature's rules: constants next to the handler

```ts
// handlers/parts/part-photo.rules.ts
export const PART_PHOTO_OWNER_TYPE = "part";
export const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_PART = 10;
export const PART_PHOTO_VARIANTS: DocumentVariantSpec[] = [
  { name: "display", maxDimension: 1200, quality: 82 },
  { name: "thumb", maxDimension: 150, quality: 75 },
];
```

A new feature gets its own rules file and its own `ownerType`; it never reuses the part's.

## The handler: validate, upload, save, clean up

1. **Validate everything before writing anything:** the record (and its uniqueness checks) and every file (type, size,
   the count after this save). A `400` here has stored nothing anywhere.
2. **Upload the files** to document-api through `IDocumentApiClient.uploadDocumentAsync`, with the feature's
   `ownerType`, the record's id and the variants. Keep each returned document id.
3. **Save the record and its file rows in one transaction** (`beginAsync()` … `commitAsync()`): `document_id`,
   `status: "pending"`, the original file name as metadata only, audit columns.
4. **If anything fails after the first upload**, delete the uploaded documents, then rethrow. Files that the save
   removed are deleted from document-api only after the commit.

```ts
const uploadedDocumentIds: string[] = [];
try {
  for (const file of files) {
    const document = await this._documentApiClient.uploadDocumentAsync(userContext, { ownerType, ownerId, ... });
    uploadedDocumentIds.push(document.id);
  }
  await using work = await this._unitOfWorkFactory.beginAsync();
  // update the record, insert the file rows
  await work.commitAsync();
} catch (error) {
  await this.deleteDocumentsAsync(userContext, uploadedDocumentIds);
  throw error;
}
```

## The rest, read when you reach it

- **The file rows, and `ready` / `failed`:** `references/document-events.md`. Without it the status stays `pending`
  for ever.
- **The web form** (picker, preview, the default photo, `FormData`): `references/web-form.md`.

## Before calling it done

- [ ] Allowed types, size and count are constants in the feature's rules file, checked in the handler.
- [ ] A new `ownerType`, sent with every upload.
- [ ] A file table with `dealer_id`, `document_id`, `status`, audit columns and soft delete (`database.md`).
- [ ] The consumer routes `document.processed.v1` and `document.failed.v1` for the new `ownerType`.
- [ ] A test for each failure path: an invalid record with files stores no document; a failure after an upload
      deletes it.
- [ ] `accept=` on the file input; images shown with `DocumentImage`, never a plain `<img src>`.
