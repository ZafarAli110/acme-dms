---
name: react-router-framework-mode
description: Routes, route modules, clientMiddleware, clientLoader, clientAction, redirects and list-page URL state in the web app (React Router framework mode, no server rendering). Use for any ticket that adds or changes a page, a route, a loader, an action, or a list's search, sort, filter or paging.
---

# React Router in the web app

The full rules are `docs/standards/web-architecture.md` ("Routes, middleware, clientLoader and clientAction"). This is
the short version, with the working examples to copy: `web/app/pages/customers/` (list, create, edit) and
`pages/SignIn.tsx` / `SignOut.tsx` (the smallest actions).

## A route module

One file per page, listed once in `app/routes.tsx`. It exports, next to its component:

- the component as the **default export**, a named function (`export default function PartEdit() {…}`);
- `clientLoader` to prefetch what the page shows; `clientAction` to save. Nothing else fetches or saves.
- A protected page sits under `ProtectedLayout`, whose `clientMiddleware` (`authClientMiddleware`) resolves the user and
  the location first and sets `RESOLVED_LOCATION_CONTEXT`. A loader or action reads the location from there, never from
  `useSelectedLocation()` (that is React's) or from storage.

```tsx
export async function clientLoader({ context, params }: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved && params["customerId"]) {
    await queryClient
      .query({ ...customerQueryOptions.detail(resolved.locationId, params["customerId"]), staleTime: "static" })
      .catch(() => null);
  }
  return null; // the page reads the data with its hook; a failure is shown there, not thrown here
}
```

## Saving: every submit is a route action

`<Form method="post">`, or `useSubmit()` from React Hook Form's `handleSubmit` (files as `multipart/form-data`). Never
`onSubmit` with `useState` for busy and error. The action calls the `queries` function, **invalidates** what changed
(`queryClient.invalidateQueries({ queryKey: CUSTOMER_QUERY_KEYS.all(locationId) })`), then returns `redirect()` or
`{ saved, error }`. The page reads `useActionData()` and `useNavigation().state === "submitting"`.

## Redirects

- A guard (middleware, a loader sending the user elsewhere) **throws** `redirect()`. A finished action **returns** it.
- Never a `redirect()` inside a `try`: the `catch` would swallow it; if it cannot be avoided, rethrow
  `if (error instanceof Response) { throw error; }`.

## Lists: the URL is the state

`?search=&page=&pageSize=&sort=&direction=&filterField=&filterOperator=&filterValue=`, read and written by
`useListParams()` (`useSearchParams`, `preventScrollReset: true`; typing replaces the history entry, a page or sort
pushes one), parsed by `readListParams`. Never `useState` for what the URL can hold (the one exception, a filter half
typed, is inside `AppDataGrid`).

- A list's `clientLoader` is `prefetchListPage(request, (params) => queryClient.query({...options.list(locationId, params), staleTime: "static"}))`.
  A transient failure (no answer, timeout) on page 2 or later redirects to page 1 with the same search, sort and filter.
- `useNavigation().state === "loading"` is the grid's busy bar: a new page, sort or filter loads in the loader while the
  grid keeps its rows.
- Scroll: `<ScrollRestoration />` (RootLayout) restores the window; `AppDataGrid` restores its own rows
  (`useGridScrollRestore`, per `location.key`). A change that should not jump to the top passes `preventScrollReset`.
- The URL page is 1-based and the grid's is 0-based; `toPaginationModel` and `handlePaginationModelChange` convert.

## Checklist

- [ ] The route is in `routes.tsx`; the page is the default export, a named function.
- [ ] A loader reads the location from `RESOLVED_LOCATION_CONTEXT` and prefetches with the query options.
- [ ] A save is an action that invalidates the keys it changed; no `useState` for busy or error.
- [ ] Redirects: thrown by guards, returned by finished actions, never inside a `try`.
- [ ] A list reads and writes its state through `useListParams`, and loads with `prefetchListPage`.
