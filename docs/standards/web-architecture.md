# Web architecture

How `web/` is built. It follows the IDS cloud DMS web client: React Router in framework mode (a single-page app, no
server rendering), kernels outside React for the signed-in user and the selected location, `clientMiddleware` in front
of every protected page, `clientLoader` and `clientAction` for loading and saving, TanStack Query for server data, React
Hook Form with Valibot for forms, and react-i18next for every string the user sees.

**New pages, and pages you change substantially, follow this.** Older pages (Home, the customer pages, the parts list,
`PartCreateDialog` and `CustomerCreateDialog`) predate it: they keep form state in `useState` and save with
`useMutation`. Do not copy them; move a page over when you rework it.

## Folders

```
app/
  core/                  application infrastructure, used by every feature
    config/              api.ts (service URLs, timeout), apiErrors.ts (ApiError, problem details)
    contexts/            React adapters: auth/useAuth.ts, location/useSelectedLocation.ts,
                         location/LocationChangeGuardContext.tsx
    formatters/          display formats shared by features (formatRole.ts)
    hooks/               useUnsavedChangesGuard.ts, useLocationChangePrompt.ts
    kernel/              authKernel.ts, locationKernel.ts
    middleware/          routerContext.ts, authClientMiddleware.ts
    queries/             queryClient.ts, QueryProvider.tsx, and API calls shared by features (identity, documents)
    services/            apiClient.ts: the only code that calls fetch
    storage/             sessionStore.ts: token and selected location
    types/               types shared by features (page.ts)
  components/            React components used by several features: Layout, Sidebar, TopBar, LanguageSwitcher,
                         FormGuards, PageHeader, ErrorAlert, DocumentImage
  locales/<language>/    translations: one JSON file per namespace (common, navigation, home, sign-in, parts, …)
  pages/                 route modules: SignIn, SignOut, ProtectedLayout, Home, NotFound, and one folder per feature
  root.tsx               the document (RootLayout), HydrateFallback and ErrorBoundary
  routes.tsx             every route
  entry.client.tsx       starts the router with the kernels in its context
  i18n.ts                languages and namespaces (types in i18n-types.d.ts)
  theme.ts
```

Inside `pages/<feature>/`, code lives at the tightest scope where it is used, in folders named for what they hold:

| Folder        | What goes in it                                                                              |
| ------------- | -------------------------------------------------------------------------------------------- |
| `queries/`    | plain `async` API functions (`partQueries.ts`) and query keys (`partQueryKey.ts`). No React. |
| `hooks/`      | `useQuery` / `useMutation` wrappers: a queries function plus its key.                        |
| `schemas/`    | Valibot schemas for the feature's forms.                                                     |
| `mappers/`    | conversion between DTOs and form values.                                                     |
| `types/`      | the feature's DTOs as the API returns them (`part.ts`).                                      |
| `formatters/` | display formats used by the feature (`formatPrice.ts`).                                      |
| `components/` | React components used by more than one page of the feature. `.tsx` only.                     |

Never `utils/`, `helpers/`, `lib/`, `misc/` or `common/`. A `core/` or `components/` file is promoted there only when a
second feature needs it. Files that are not components are camelCase (`partQueries.ts`, `useAuth.ts`); components and
route modules are PascalCase (`PartList.tsx`, `PartEdit.tsx`, `PartCreate.tsx`, `PartForm.tsx`).

## Signed-in user and location: kernels

`core/kernel/authKernel.ts` and `core/kernel/locationKernel.ts` are the single source of truth for who is signed in
and which location is selected. They are plain classes outside React, so middleware, loaders and actions can use them:

- React reads them with `useAuth()` (`user`) and `useSelectedLocation()` (`location`, `locations`, `can(permission)`,
  `switchLocation`). Never read session storage or call identity-api from a page.
- The API client sends the selected location as `x-location-id`. Switching location refreshes what is on screen.
- `useSelectedLocation` is not React Router's `useLocation` (the URL).

## Routes, middleware, clientLoader and clientAction

Every route is in `app/routes.tsx`. A route module's component is its default export (React Router requires it), as a
named function: `export default function PartEdit() {…}`. Protected pages sit under `pages/ProtectedLayout.tsx`, whose
`clientMiddleware` (`authClientMiddleware`) waits for both kernels, then sets `RESOLVED_LOCATION_CONTEXT`, or
redirects to `/sign-in`.

Next to its component, a route module exports what it needs:

- **`clientLoader({context, params})`**: reads `context.get(RESOLVED_LOCATION_CONTEXT)` for the location, then
  prefetches with `queryClient.query({...options, staleTime: 'static'})` (cached data if there is any, otherwise one
  fetch; it replaces the deprecated `ensureQueryData`) using the same key as the page's hook, so the page renders
  without a spinner.
- **`clientAction({request, context, params})`**: reads the submitted form data, calls the queries function,
  invalidates the affected keys with `queryClient.invalidateQueries(...)`, then redirects (create → the new record's
  page) or returns `{error}` for the page to show.
- **Every submit goes through a route action**: React Router's `<Form method="post">`, or `useSubmit()` from a React
  Hook Form `handleSubmit` (files as `multipart/form-data`). Never `onSubmit` with `useState` for busy and error. The
  page reads the result with `useActionData()` and the saving state with `useNavigation().state === 'submitting'`.
  `pages/SignIn.tsx` and `pages/SignOut.tsx` are the smallest examples.
- **Redirects: guards throw, finished actions return.** A guard (middleware, a loader that sends the user elsewhere, a
  `require…` helper) **throws** `redirect()`: it stops there, works from inside a helper, and the code after it can rely
  on the condition. An action that finished successfully **returns** `redirect()`. A thrown redirect is an exception,
  so never put one inside a `try`: a `catch` would swallow it. Where that cannot be avoided, the `catch` rethrows it
  first (`if (error instanceof Response) { throw error; }`).

## Server data: three layers

1. **`queries/<resource>Queries.ts`**: `async` functions that call `apiClient` (`core/services/apiClient.ts`), named
   with `Async` and taking `{signal}` so TanStack Query can cancel them. Called from loaders, actions and hooks. Pages
   never call `apiClient` directly.
2. **`queries/<resource>QueryKey.ts`**: the keys. **A key for location-scoped data includes the location id**
   (`['bins', locationId]`), so a switch never shows the previous location's data.
3. **`hooks/use<Thing>.ts`**: `useQuery`/`useMutation` built from the two. Components call hooks; they never build
   keys.

The cache is the single `queryClient` in `core/queries/queryClient.ts`. Errors are typed (`core/config/apiErrors.ts`):
`ApiError` carries the service's problem details; `ServerUnreachableError` and `RequestTimeoutError` mean no answer.

**Lists keep their search and page in the URL** (`?search=brake&page=2&pageSize=50`), read and written with
`useListParams()` (`core/hooks/useListParams.ts`), so a refresh, Back and a shared link all show the same list. The
route's `clientLoader` reads the same params with `readListParams(new URL(request.url).searchParams)` and prefetches
that page. The search box is uncontrolled (`defaultValue`), so typing never waits for the list. Never `useState` for
what the URL can hold, and never `useEffect` to copy server data into state: give the form its `defaultValues`, and
remount it with a `key` when the record changes.

## Forms: schema → mapper → form → page

| Layer  | File                                      | Responsibility                                                                                                                                                                                         |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema | `schemas/<entity>Schema.ts`               | A factory `create<Entity>Schema(t)` that returns the Valibot schema with translated messages; the form calls it once per language with `useMemo`. Separate create and update schemas when they differ. |
| Mapper | `mappers/<entity>FormMapper.ts`           | `toFormValues(dto)` for defaults; the request body built from the values, following the DTO rules (every field present, `null` for no value; a PATCH sends only what changed).                         |
| Form   | `<Entity>Form.tsx`                        | `useForm` with `valibotResolver(schema)` and `defaultValues`; one `Controller` per field showing `fieldState.error` as `helperText`.                                                                   |
| Page   | `<Entity>Create.tsx` / `<Entity>Edit.tsx` | the route module: `clientLoader`, `clientAction`, Save and Cancel, server errors, `<FormGuards>`.                                                                                                      |

References: parts (`PartEdit`, `PartForm`) and customers (`CustomerCreate`, `CustomerEdit`, `CustomerForm`, with
`components/CustomerFields.tsx` for fields shared by create and edit). `parts/PartCreateDialog.tsx` predates this
standard (`useState` form, `useMutation`, no schema) and is due to be replaced; do not copy it.

Rules:

- **One Save per form.** Everything on the form, files included, is sent together when Save is pressed; nothing is
  saved on its own as the user types or picks a file. The service saves it as one unit
  (`docs/standards/file-uploads.md`, "Saving a record together with its files").
- **Always give `defaultValues`.** Number inputs hold strings; the schema turns them into numbers. An empty number field
  is "required", never `0`.
- **Server errors**: a problem that belongs to a field (a duplicate part number, `409`) is shown on that field with
  `setError`; anything else as an alert above the form. What the user typed is kept.
- **Save is disabled while submitting**, so one click saves once.
- **Unsaved changes**: every form page renders `<FormGuards isDirty={isDirty && !isSubmitting} redirectTo="/list" />`
  (`app/components/FormGuards.tsx`). It asks before leaving the page (links, back, closing the tab) and before
  switching location in the top bar. A successful save must not ask.

## Text the user sees: translations

Every string the user sees goes through react-i18next: `const {t} = useTranslation('parts')` in components,
`i18n.t(...)` outside React (actions, kernels). English and French; the user picks in the top bar's language dropdown,
and the choice is remembered in the browser.

- One namespace per feature, named like its folder (`parts`, `customers`), plus `common` and `navigation` for the shell.
  A new namespace is added to `i18n.ts` and `i18n-types.d.ts`.
- `locales/en` is the reference: keys are type-checked against it, so a missing English key fails `typecheck`. Add the
  French text in `locales/fr` at the same time.
- Problem details from the services are in English. Show them as they are, unless the page has a better message for a
  known case (sign-in shows its own message for a 401).
- Dates, numbers and prices are formatted with the selected language (`i18n.language`), never a fixed locale: dates
  with Temporal and Intl through `core/formatters/formatDate.ts`, prices with `Intl.NumberFormat`. Temporal is native
  where the browser has it; `root.tsx` loads `temporal-polyfill` for the others.

Packages: `react-router` and `@react-router/dev`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`
(`valibotResolver`), `valibot`, `i18next`, `react-i18next` and `i18next-browser-languagedetector`.
