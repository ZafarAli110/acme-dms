# Files in a web form

The files are fields of the form like any other: picked, previewed, removed and checked in the form, and sent with
everything else when the user presses Save. Nothing is uploaded on its own as a file is picked. The example is the part
page: `web/app/pages/parts/` (`PartForm.tsx`, `components/PartPhotosSection.tsx`, `mappers/partFormMapper.ts`,
`constants/partPhotoRules.ts`). Build the rest of the page with the `web-form-page` skill.

## The values

Each file is one entry in a `useFieldArray`, the saved ones and the new ones alike:

```ts
interface PhotoFormValue {
  key: string; // stable React key: the photo id, or crypto.randomUUID() for a new file
  photoId: string | null; // set for a saved photo
  documentId: string | null;
  file: File | null; // set for a new file
  fileName: string;
  isDefault: boolean;
}
```

`toFormValues(record)` maps the saved files with `file: null`; picking adds entries with `photoId: null`.

## The same rules as the service, checked before sending

`constants/<thing>Rules.ts` repeats the handler's types, size and count, so the user sees a mistake on the field
before anything is sent. The service still checks: the form's copy is for the user, the service's is the rule.

```ts
file: v.nullable(
  v.pipe(
    v.instance(File),
    v.check((file) => RULES.types.includes(file.type), (issue) => t("…photoType", { name: (issue.input as File).name })),
    v.check((file) => file.size <= RULES.maxBytes, (issue) => t("…photoSize", { name: (issue.input as File).name })),
  ),
),
```

A rule about the whole list (the count, exactly one default) goes on the array with `v.check`, and the section shows
`formState.errors.photos?.root?.message`.

## The picker

- `<input type="file" multiple accept={RULES.types.join(",")}>`, so the file dialog offers only allowed types.
- Show what is allowed next to it ("JPEG, PNG … up to 10 MB"), from the same constants.
- A new file is previewed from the `File` itself with `useObjectUrl(file)`, which revokes the URL when the tile goes;
  a saved one with `DocumentImage` (`components/DocumentImage.tsx`), which fetches the content with the user's token. Never a plain
  `<img src>` to document-api: it would be sent without the token.
- Change the default with `setValue("photos", …, { shouldDirty: true })`, so the page knows there is something to
  save.

## Sending

The mapper builds the multipart body; the page's `clientAction` sends it as it is:

```ts
// mappers/<entity>FormMapper.ts
const form = new FormData();
form.append("payload", JSON.stringify(payload)); // the changed fields, the files to keep, one entry per new file
for (const photo of added) {
  form.append("photos", photo.file, photo.fileName);
}

// the form
submit(toUpdateFormData(values, saved), { method: "post", encType: "multipart/form-data" });

// the route's clientAction
await partQueries.updatePartAsync(partId, await request.formData());
```

Never set a `Content-Type` header by hand on a `FormData` request: the browser adds it, with the boundary.

## After the save

The page shows the record as saved, with each new file `pending`, and polls while any file is `pending`
(`refetchInterval`), so `ready` or `failed` appears without a reload. A `failed` file shows its reason and can be
removed.
