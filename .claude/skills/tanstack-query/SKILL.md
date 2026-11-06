---
name: tanstack-query
description: Server data in the web app with TanStack Query: query keys, queryOptions, hooks, the shared queryClient, staleTime, invalidation after a save, and what is cleared on sign-out and location switch. Use for any ticket that reads or caches server data in the web app.
---

# TanStack Query in the web app

The rules are `docs/standards/web-architecture.md` ("Server data: four layers"). Working example: the customers
feature, `web/app/pages/customers/{queries,hooks}/`.

## Four layers, one place each

1. `queries/<resource>Queries.ts`: `async` functions over `apiClient`, named `…Async`, taking `{ signal }`. Pages never
   call `apiClient` or `fetch`.
2. `queries/<resource>QueryKey.ts`: the keys, **location id first** for location-scoped data
   (`["customers", locationId, "list", params]`), so a location switch never shows another rooftop's rows.
3. `queries/<resource>QueryOptions.ts`: `queryOptions({ queryKey, queryFn })` once per query. The route's `clientLoader`
   prefetches with it and the hook reads with it: they cannot disagree.
4. `hooks/use<Thing>.ts`: `useQuery(options)` plus only what the page needs (`select`, `enabled`, `refetchInterval`).
   Components call hooks and never build keys.

```ts
export const CUSTOMER_QUERY_KEYS = {
  all: (locationId: string) => ["customers", locationId] as const,
  detail: (locationId: string, id: string) => ["customers", locationId, "detail", id] as const,
};
```

## The one cache

`core/queries/queryClient.ts`, a module (not React state) so loaders and actions use the same cache as the pages.

- `staleTime` is five minutes: what a loader just fetched is not fetched again when the hook mounts. A loader passes
  `staleTime: "static"` to use whatever is cached, otherwise one fetch. Freshness comes from **invalidation**, not
  from refetching: no `refetchOnWindowFocus`, no manual refetch on mount.
- `retry` once, and only for no answer, a timeout or a 5xx; a 4xx will not change. Errors are typed
  (`core/config/apiErrors.ts`): `ApiError` carries the problem details, `isTransientError` means no answer.
- `queryClient.clear()` on sign-out and sign-in as someone else (`authKernel`); `invalidateQueries()` on a location
  switch (`locationKernel`). Never keep a copy of server data in `useState` or copy it with `useEffect`.

## Saving

A save is a route action (see the `react-router-framework-mode` skill): after it succeeds it calls
`queryClient.invalidateQueries({ queryKey: <RESOURCE>_QUERY_KEYS.all(locationId) })`, so every list, count and detail
of that resource refetches the next time it is shown. Prefer an action over `useMutation`; the one `useMutation` left
(`PartCreateDialog`) predates the standard.

## Odd cases

- Data that updates on its own (a photo being processed): `refetchInterval` that returns `false` once it is done
  (`usePart`).
- A binary (an image): `staleTime: Infinity` is right when the URL never changes its content (`DocumentImage`).
- A query that must wait (a dialog closed, no location yet): `enabled`.

## Checklist

- [ ] A new resource has all four layers, and its keys start with the location id when its data is location-scoped.
- [ ] The loader and the hook share one `queryOptions` object.
- [ ] A save invalidates `…KEYS.all(locationId)`; nothing refetches by hand.
- [ ] No server data in `useState`; no `useEffect` that copies a query result into state.
