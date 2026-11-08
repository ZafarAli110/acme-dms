# ACME-117: The system holds a busy Saturday morning (count once per question, not once per page)

**Created:** 2026-11-08 21:04

**Status:** Done

**Ticket:** ACME-117 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** No screen change: the customer list, its footer ("1–25 of 10,000+"), Home's tile and the export dialog
look exactly as after ACME-119, with the total there when the page first shows (the route prefetches it).

**Now:** Done: verified, evidence in `docs/evidence/ACME-117-count.md` · Next: ACME-117's next step (the city index) ·
Blocked: None

## Requirement

ACME-117, in the ticket's words: the system holds a busy Saturday morning, about 3,300 requests a second, with 95 of
every 100 pages answering within about a third of a second, at Northside as at a small location. This plan is one step
towards that: after ACME-119 the laptop holds about 150 to 200 a second, and counting is 88% of the database's time,
because every page of the customer list counts again though the total only changes with the question.

- **In:** a plain list's or a filtered list's page stops counting (it says whether a next page follows); a count
  endpoint answers the total for a search and filter; the web keeps the total per question, apart from the pages; the
  load test sends what the web now sends. This step's bar: at 200 a second none fail and p95 is within a second.
- **Out (the ticket's other criteria, and where they are delivered):** 3,300 a second at a third of a second (later
  steps of ACME-117, each measured with `bun run load-test` and `sql:top`, and an environment shaped like production:
  ARCHITECTURE "Handling load"); a person or script told to slow down (done: ACME-117's per-sign-in share, 429);
  adding servers adds capacity and nothing is lost when one stops (done: `DEALERSHIP_API_INSTANCES`, the migration
  lock; stopping work for callers who left: ACME-121); two people saving the same customer still get "someone else
  changed it" (unchanged here: the ETag on save, ACME-109); a search's page keeps its own count (D3).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Page 2 of the plain list, a sort, a filtered page → the handler runs no `count(*)` (the handler test's recorded
      SQL)
- [x] Open Customers, change the search or the filter → the web asks for the count once for that question; going back
      to a question asked within five minutes uses the total already fetched (the web query test)
- [x] The footer, Home's tile and the export dialog → the same numbers as before ("10,000+" past 10,000), there when
      the page first shows
- [x] Save a customer → the pages and the totals are fetched again
- [x] A search for a term nobody has ("ahed") → its page still comes from the trigram index, never a walk of the
      location (ACME-119's plans test, kept)
- [x] The busy-morning check at 200 a second, against `start:prod --load-test` → none fail, p95 within a second; the
      highest rate that holds, and `sql:top`'s new top statement, in the Log

Failure: invalid input, absent data, not allowed, another service down

- [x] The count with a field the list does not have → 400, as the list does today
- [x] The count without `customers.read` → 403; Riverside's and deleted customers never counted at Northside; at
      another dealer, nothing of Northwind's counted
- [x] The last page → `hasMore` false; a page past 10,000 → 400 as today

## Load before building

| Item                                                                        | Kind     | Why                                                 | Loaded? |
| --------------------------------------------------------------------------- | -------- | --------------------------------------------------- | ------- |
| `build-api-endpoint`                                                        | Skill    | the count endpoint                                  | [x]     |
| `tanstack-query`                                                            | Skill    | the count query per question, its key, invalidation | [x]     |
| `docs/standards/multi-tenancy.md` "The database enforces it too"            | Standard | the count handler joins the owner-path exception    | [x]     |
| `docs/standards/web-architecture.md` "Routes, …clientLoader", "Server data" | Standard | the loader prefetches the count; the four layers    | [x]     |

## Shape

**Follows:** the list handler's own count (ACME-119: capped, owner path for searches and text filters) and the web's
existing count query (`customerQueryOptions.count`, Home) · **Deviates:** the customer list's response has `hasMore`
in place of `total`

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/business-logic/handlers/customers/get-list/get-customer-list.query-handler.ts`: a
   plain or filtered page fetches `pageSize + 1` ids for `hasMore` and does not count; a search's page keeps its
   capped count to choose its path (D3) and answers `hasMore` the same way
2. `backend/dealership-api/src/business-logic/handlers/customers/count/count-customers.query-handler.ts` (**new**,
   its interface and token in `business-logic-abstractions/handlers/customers/count/`, registered in
   `BusinessLogicModule`): the capped count with the list's `where` (`customerListWhere`) and path (`matchesText`)
3. `backend/dealership-api/src/dto/customers/customer-page-response.dto.ts` (**new**: `{ items, page, pageSize,
hasMore }`), `customer-count-response.dto.ts` (**new**: `{ total }`)
4. `backend/dealership-api/src/service/controllers/customers/customer.controller.ts`: `GET /v1/customers/count`
   (before `:customerId`, `customers.read`, the list's query schema), the list's new response
5. Tests: `get-list/__test__/get-customer-list.query-handler.test.ts` (pages, `hasMore`, no `count(*)` recorded for a
   plain page or a sort), `count/__test__/count-customers.query-handler.test.ts` (**new**: 10,000, 10,001, 0;
   Riverside and deleted; tom sees none of Northwind's; 400 for an unknown field); the plans test keeps "ahed"; 403
   is the authorization guard's (`service/guards/__test__/authorization.guard.test.ts`, the permission on the route)
6. `web/app/pages/customers/queries/customerQueries.ts`, `customerQueryKey.ts`, `customerQueryOptions.ts`: the count
   per question (`count(locationId, question)`; the question is the search and the filter, not the page or the sort)
7. `web/app/pages/customers/hooks/useCustomerList.ts`, `useCustomerCount.ts`; `CustomerList.tsx`: its clientLoader
   prefetches the count beside `prefetchListPage` (`staleTime: "static"`); the grid's `rowCount` and the export dialog
   from the count
8. `web/app/pages/Home.tsx`: its loader's prefetch and `useCustomerCount` with the empty question, keeping `enabled`
9. `web/app/pages/customers/types/customer.ts`: the page type; `web/app/pages/customers/queries/__test__/customerQueryKey.test.ts`
   (**new**): paging and sorting keep one count key, a new search makes another
10. `scripts/load-test.ts`: `placeAsync` takes each location's total from the count endpoint (a missing total is an
    error, never a silent page 1); a customer list view sends one count, then pages
11. `docs/standards/multi-tenancy.md`: the exception names the count handler too; `docs/ARCHITECTURE.md` "Handling
    load": count once per question

High-level code:

```ts
// get-customer-list.query-handler.ts
const rows = await db.select({ id: customers.id }).from(customers).where(where).orderBy(...order)
  .limit(pageSize + 1).offset(pageOffset(page, pageSize));
return { ids: rows.slice(0, pageSize).map((row) => row.id), hasMore: rows.length > pageSize };
// a search: first its capped count (as in ACME-119), then the trigram-only settings when it is 10,000 or fewer

// CustomerList.tsx clientLoader
await Promise.all([prefetchListPage(...), queryClient.ensureQueryData({ ...customerQueryOptions.count(locationId,
  questionOf(params)), staleTime: "static" })]);
```

**Impact:** Breaking changes: `GET /v1/customers` answers `hasMore` instead of `total` (clients: the web, the load
test, `bun run api` for people); the count is a new endpoint · Depends on: ACME-119 · Performance: a plain or
filtered list view costs one count plus its pages; paging and sorting cost a page (0.2 to 30 ms, `sql:top`); a search
costs its count on each page, as today (13% of the database's time at 200 a second)

## Tests

| Kind                    | File                                                        | Proves                                                   |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Handler (real Postgres) | `get-list/__test__/get-customer-list.query-handler.test.ts` | pages, `hasMore`; no `count(*)` for a plain page or sort |
| Handler (real Postgres) | `count/__test__/count-customers.query-handler.test.ts`      | totals; Riverside, deleted, another dealer; 400          |
| Plans (real Postgres)   | `get-list/__test__/get-customer-list.plans.test.ts`         | "ahed" still pages through the trigram index             |
| Unit (web)              | `queries/__test__/customerQueryKey.test.ts` (**new**)       | one count key per question                               |
| Load (running system)   | `load-test --rate 200`, `sql:top --reset` before            | none fail, p95 ≤ 1 s; counts about one per list view     |

## Steps

- [x] 1. Tests first: the list without a count, the count handler's totals, the web key → verify: they fail on today's
      code
- [x] 2. API: the list's page, the count handler and endpoint → verify: the handler and plans tests
- [x] 3. Web: the count per question, the loaders' prefetch, the grid, the export dialog, Home → verify: web tests and
      typecheck; the footer, Home and the dialog in a browser (`check-in-browser`) show the totals on first paint
- [x] 4. Load test: totals from the count, views count once → verify: `bun run load-test --rate 25` and `sql:top`:
      plain-list counts about one per list view, none on paging
- [x] 5. Docs and gates → verify: `bun run gate:fast`
- [x] 6. Measured: `sql:top --reset`, `load-test --rate 200`, then higher → verify: none fail at 200, p95 ≤ 1 s

## Questions

None: nothing a person sees changes.

## Decisions

- D1 A separate count endpoint, over a `?total=false` switch on the list: the web caches a total per question and a
  page per page, so neither refetches the other.
- D2 `hasMore` from one extra id, over counting: the page knows whether more follow from the index it already walks.
- D3 A search's page keeps its capped count, over dropping it: ACME-119 chooses the search's path by it (trigram only
  at 10,000 matches or fewer: "ahed" 0.2 ms instead of 6.5 s; the name index past that: "gmail" 1 ms instead of
  609 ms). Searches are 15% of the traffic and their count 13% of the database's time; the plain and filtered counts
  (72%) are the ones that go.

## Log

- 2026-11-08 21:04 `bun run sql:top` after `load-test --rate 200` (12,000 answered, p95 827 ms): counting was 88% of
  the database's time: the plain list's capped count 62% (5,570 calls, 94 ms mean under load; idle 11 ms as sam, 6 ms
  as rita, 0.2 ms as tom), the search count 13%, the text-filter count 10% (190 ms: the rare city, ACME-119 D3), the
  status-filter count 3%; the search's page 8%; fetching the rows 1%.
- 2026-11-08 21:08 Architect: CHANGES, 7 findings. Fixed: a search's page keeps its count (D3: the search path needs
  it); the Requirement in the ticket's words with every criterion In or Out; Home and the list loader's prefetch in
  Files (the total on first paint); multi-tenancy.md names the count handler; the load test's last page from the count
  endpoint; checks that exist (recorded SQL, the guard's test for 403, a new web key test).
- 2026-11-08 22:05 Loaded: build-api-endpoint, tanstack-query, multi-tenancy.md, web-architecture.md (loaders, server data).
  In progress.
- 2026-11-08 22:16 Steps 1, 2, 4, 5: tests first (the list's `hasMore`, the count handler's totals, Riverside, deleted, another
  dealer, 400; no `count(*)` recorded for a plain page, page 2, a sort or a filter) failed on the old code, then pass:
  dealership-api 242 tests. `CountCustomersQueryHandler` reuses the list's `customerListWhere`, `matchesText`,
  `countUpToDepthAsync` and `ownerScoped`; `GET /v1/customers/count`. Web: `CustomerPage`, `CustomerQuestion`, the
  count key per question (a new test: one key while paging and sorting), both loaders prefetch it; 64 web tests,
  typecheck. Load test: totals from the count endpoint (a missing total is an error), a "customers count" kind (8 of
  100). `gate:fast` 19 of 19.
- 2026-11-08 22:16 Step 6, measured by Claude: `load-test --rate 200`: 12,000 of 12,000, p50 15 ms, p95 89 ms; Postgres 267% (was
  572%), 1.6 queries running (was 14.6); `sql:top`'s total about 107 s (was 840 s). Top now: the city filter's count
  34% (the rare city, ACME-119 D3), the search's count 27%, its page 15%, the plain count 11%, last-contact sort 9%.
  `--rate 400`: 148 a second answered, 15,132 busy, 0 failed, p95 1.8 s (ACME-121 holds), Postgres 763%. `--rate 800`:
  nothing answered while Postgres idled at 7% with 25,000 requests in flight: the test rig (one laptop sending and
  serving) is the limit there, not the system. Capacity on the laptop: about 200 to 250 a second.
- 2026-11-08 22:25 The verifier: PASS (the browser's requests while paging and searching; the footer on first paint, Home, the
  dialog; counts against SQL at three locations and another dealer; `hasMore` at the last page). Evidence:
  [docs/evidence/ACME-117-count.md](../docs/evidence/ACME-117-count.md). Done.
