---
name: web-form-page
description: Builds or changes a create or edit page with a form in the web app (React Router, React Hook Form, Valibot, TanStack Query). Use for any ticket that adds or changes a form the user fills in.
---

# A web form page

The rules are in `docs/standards/web-architecture.md` ("Forms", "Server data", "Text the user sees"). The reference is
the part edit page: `web/app/pages/parts/` — `PartEdit.tsx` (page), `PartForm.tsx` (form), `schemas/partSchema.ts`,
`mappers/partFormMapper.ts`, `queries/partQueryKey.ts`. Copy that shape; `PartCreateDialog.tsx` is the old pattern
(`useState`, `useMutation`) and is not to be copied.

## Steps

1. **Schema** `schemas/<entity>Schema.ts`: Valibot at module level; messages are translation keys. Number inputs hold
   strings; an empty number is "required", never `0`.
2. **Mapper** `mappers/<entity>FormMapper.ts`: `toFormValues(dto)` for `defaultValues`; the request body follows the
   DTO rules (every field, `null` for none; a `PATCH` sends only what changed).
3. **Form** `<Entity>Form.tsx`: `useForm` with `valibotResolver(schema)` and `defaultValues`; one `Controller` per
   field with `fieldState.error` as `helperText`. Components are `function` declarations.
4. **Page** `<Entity>Create.tsx` / `<Entity>Edit.tsx`: the route module with `clientLoader` and `clientAction`, one
   Save (disabled while submitting) and Cancel, `<FormGuards isDirty={isDirty && !isSubmitting} redirectTo=… />`.
   A field's server error (`409`) goes on that field with `setError`, keeping what the user typed; anything else is an
   alert above the form.
5. **Query keys start with the location id** (see `partQueryKey.ts`), including lookups such as bins. After a save,
   invalidate the list.
6. **Every text in `locales/en/` and `locales/fr/`**, in the page's namespace. No literal strings in components.
7. Register the route in `routes.tsx`.

## Prove it

In the running app: save once; a duplicate shows on its field; leaving with changes asks, a successful save does not;
switch location and check no previous-location data is shown; switch to French and check every label.
