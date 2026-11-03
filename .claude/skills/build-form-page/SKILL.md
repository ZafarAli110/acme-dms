---
name: build-form-page
description: Builds or changes a create or edit page with a form in the web app (React Router, React Hook Form, Valibot, TanStack Query). Use for any ticket that adds or changes a form the user fills in.
---

# A web form page

React Router loads and saves the record, React Hook Form holds what the user types, Valibot checks it, and TanStack
Query caches it. Copy the working examples, not the old one:

- **Create and edit sharing one form:** `web/app/pages/customers/` (`CustomerCreate.tsx`, `CustomerEdit.tsx`,
  `CustomerForm.tsx`, fields in `components/CustomerFields.tsx`).
- **Edit with files:** `web/app/pages/parts/` (`PartEdit.tsx`, `PartForm.tsx`).
- **Never copy** `parts/PartCreateDialog.tsx`: a `useState` per field, `useMutation`, no schema.

The rules behind this: `docs/standards/web-architecture.md` ("Forms", "Server data").

## Four files per form

| File                                      | Holds                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `schemas/<entity>Schema.ts`               | `create<Entity>Schema(t)`: the Valibot rules, with translated messages |
| `mappers/<entity>FormMapper.ts`           | `toFormValues(record)` for the form; the request body from the values  |
| `<Entity>Form.tsx`                        | `useForm`, one `Controller` per field, Save and Cancel, `<FormGuards>` |
| `<Entity>Create.tsx` / `<Entity>Edit.tsx` | the route: `clientLoader`, `clientAction`, loading and not-found       |

## React Router: the route loads and saves

- **`clientLoader`** prefetches with the feature's query options, so the page's hook finds the record in the cache:
  `await queryClient.query({ ...customerQueryOptions.detail(locationId, id), staleTime: "static" }).catch(() => null)`.
- **`clientAction`** saves: read the body (`request.json()`, or `request.formData()` when files go with it), call the
  feature's `…Async` function in `queries/`, invalidate `<ENTITY>_QUERY_KEYS.all(locationId)`, then return
  `{ saved: true, error: null }`, or `redirect()` to the new record after a create.
- **The form submits through the route:** `methods.handleSubmit((values) => submit(toBody(values), { method: "post",
encType: "application/json" }))`. Never call the API from a component; never `useMutation` on a form page.
- Read the state from the router: `useNavigation().state === "submitting"`, `useActionData<typeof clientAction>()`.

## React Hook Form

- `useForm<FormValues>({ resolver: valibotResolver(schema), defaultValues: toFormValues(record) })`. Always give
  `defaultValues`. Every input holds a string, numbers too (`"12.50"`): the schema checks it, the mapper converts it.
- One `Controller` per field, rendering a MUI `TextField` with `error={fieldState.invalid}` and
  `helperText={fieldState.error?.message}`, so each error shows under its field. Fields shared by create and edit live
  in `components/<Entity>Fields.tsx`, inside `<FormProvider>`, reading `useFormContext()`.
- `<Box component="form" id="…" noValidate onSubmit={save}>`: `noValidate`, so our messages show, not the browser's.
- **After an edit saves, remount the form** with `key={record.updatedAt}`: it starts clean from what was saved. Never
  a `useEffect` that copies data into the form or calls `reset()`.
- **Save** is disabled while submitting (one click, one save); on an edit, also until something changed (`!isDirty`).
  Its label becomes `actions.saving` while it saves.
- **`<FormGuards isDirty={isDirty && navigation.state === "idle"} redirectTo="/<list>" />`**, once per form: it asks
  before the user leaves with unsaved changes or switches location. `"idle"`, so a save and its redirect never ask.

## Valibot

- A factory, because the messages are translated: `create<Entity>Schema(t)`, built once per language with
  `useMemo(() => createCustomerSchema(t), [t])`, ending in `satisfies v.GenericSchema<FormValues, unknown>`.
- Text: `v.pipe(v.string(), v.trim(), v.nonEmpty(t("…")), v.maxLength(MAX, t("…")))`, with the service's limits.
  A number: a string checked with `v.regex`; an empty number is "required", never `0`.

## Errors: each in its place, and what the user typed is kept

| What went wrong                                      | Where it shows                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| A rule the form can check (empty, too long, format)  | under the field, from the schema, before anything is sent   |
| The service rejects one field (`409`, a value taken) | under that field, from the `clientAction`                   |
| Anything else (no answer, `403`, `500`)              | one `Alert` above the form: `problemErrorMessage(error, …)` |

A field error from the service comes back from the action and reaches the field through `useForm`'s `errors`. For
example, creating a part whose number is already taken:

```ts
// clientAction: a conflict belongs to the part number; anything else is the alert above the form
if (error instanceof ApiError && error.type === PROBLEM_TYPE.conflict) {
  const message = i18n.t("parts:validation.partNumberTaken");
  return { error: null, fieldErrors: { partNumber: { type: "server", message } } };
}
return { error: problemErrorMessage(error, i18n.t("errors.unexpected")), fieldErrors: null };

// the form: no useEffect, no setError by hand
const methods = useForm<FormValues>({ resolver, defaultValues, errors: actionData?.fieldErrors ?? undefined });
```

## TanStack Query

- Keys come from `queries/<entity>QueryKey.ts` and start with the location id; each query's key and fetch are defined
  once in `queries/<entity>QueryOptions.ts`; the page reads through a hook in `hooks/` (`useCustomer`). A component
  never builds a key.
- While loading, a `Skeleton`; a record not found here, an `Alert` with a link back to the list (`CustomerEdit.tsx`).

## Text and routes

- Every label, message and button is `t("…")` in the page's namespace, in `web/app/locales/en/` and `…/fr/`. Save,
  Cancel and Saving come from `common` (`actions.save`, `actions.cancel`, `actions.saving`).
- Register the page in `web/app/routes.tsx`.
