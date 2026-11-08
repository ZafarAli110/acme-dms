# ACME-122: When the system is busy, the desk sees it, the page tries again, and a save keeps its form

**Created:** 2026-11-08 23:48

**Status:** Done

**Ticket:** ACME-122 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Web

**Design:** Follows: the Locations page's snackbar (`LocationAssignmentCell.tsx`: MUI `Snackbar` with an `Alert`)

**Now:** Done: verified, evidence in `docs/evidence/ACME-122.md` · Next: commit on Zafar Ali's word; he moves the ticket · Blocked: None

## Requirement

Sam, on a busy morning: "I need to know what's going on … if I lose a form I typed while a customer waited, I have to
start again." When the system answers busy (ACME-121: 503 `urn:acme:error:busy`, `Retry-After: 1`), every page says so,
tries again by itself, and never loses what someone typed.

- **In:** a busy answer becomes a known error in the web; a page's data is tried again twice, a second apart, with a
  line at the bottom of the screen, on every page and on the first load; then "still busy" where the page shows it; a
  busy save keeps its form and says nothing was saved.
- **Out:** how the system decides it is busy (ACME-121); idempotency keys for saves that time out (the NestJS
  checklist ticket); trying again after other failures (unchanged: one retry for no answer, a timeout or a 5xx).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Open Customers from inside the app (Home's shortcut) while its list is answered busy, then answered → "The system is busy, trying
      again…" at the bottom of the screen, then the list; the line goes away
- [x] Open Customers by its address (a first load, before the menu shows) the same way → the same line over the
      loading screen, then the list: never a long spinner
- [x] Sign in while Home's data is answered busy, then answered → the same line, then Home
- [x] A customer's page and a part's page answered busy, then answered → the same line, then the record
- [x] A page answered busy twice → it is asked exactly three times in all, about a second apart (two tries again; the
      page does not start a second round when it shows)
- [x] With the system calm → no line, no change to any page (one retry for no answer, a timeout or a 5xx, as today)

Failure: invalid input, absent data, not allowed, another service down

- [x] Customers still busy after its two tries → "The system is still busy. Try again in a moment." above the grid,
      after three requests, never a fourth
- [x] A customer's or a part's page still busy → "still busy" on the page, never "not found at this location"
- [x] Home still busy → "still busy" at the top of Home, not counts that stay grey
- [x] Save a new customer while saves are answered busy → the form keeps every field and says "The system is busy and
      nothing was saved. Your changes are still here: try again in a moment."; one request sent, not again by itself
- [x] Save it again by hand once the system answers → the customer is added once (busy is only ever answered before
      anything is written: ACME-121's "never busy after a commit")
- [x] An edit of a customer answered busy → the same message, every field as typed, one request sent
- [x] The new-part dialog: its bins answered busy → "still busy"; its save answered busy → the save message (each its
      own message)
- [x] A 4xx (validation, conflict) → unchanged: never tried again, its own message

## Load before building

| Item                                            | Kind     | Why                                              | Loaded? |
| ----------------------------------------------- | -------- | ------------------------------------------------ | ------- |
| `tanstack-query`                                | Skill    | `queryClient.ts`, the query options, retries     | [x]     |
| `react-router-framework-mode`                   | Skill    | the route modules, root and its hydrate fallback | [x]     |
| `docs/standards/web-architecture.md`            | Standard | where shared components and errors live          | [x]     |
| `docs/standards/api-errors.md` (the type table) | Standard | the busy type against service-unavailable        | [x]     |
| `check-in-browser`                              | Skill    | screenshots of the notice and the messages       | [x]     |

## Shape

**Follows:** `LocationAssignmentCell.tsx` (a `Snackbar` with an `Alert`), `ErrorAlert.tsx` above the grid (how the
lists show a failed query) · **Deviates:** the first e2e spec that answers for the API with Playwright's `page.route`
(a real busy morning cannot be made on demand in a test; the live check in step 6 covers the real thing)

Files (each checked to exist, or marked **new**):

1. `web/app/core/config/apiErrors.ts`: `PROBLEM_TYPE.busy`; `isBusyError(error)` (new); `problemErrorMessage` (the
   clientActions' message: saves, and sign-in, which is never busy) answers busy with the save message
2. `web/app/core/queries/queryClient.ts`: `retry` and `retryDelay` from two pure functions, `shouldRetryQuery` and
   `retryDelayMs` (new, same file): busy → up to 2 tries again, 1 s apart (the `Retry-After`); others as today
3. `web/app/core/queries/busyQueries.ts` (**new**): `isRetryingBusy(queries)`, pure, for the notice and its test
4. `web/app/components/BusyNotice.tsx` (**new**): the line at the bottom of the screen while any query is being tried
   again after a busy answer, read from the query cache
5. `web/app/RootLayout.tsx`: `BusyNotice` once, inside `QueryProvider` beside the page: it wraps every page, the
   hydrate fallback (the first load) and sign-in to Home, since loaders run before `Layout` exists
6. The query options every clientLoader fetches, `retryOnMount: false` on each, with why (the loader has had its
   tries and runs again on every visit, so the page does not start a second round):
   `pages/customers/queries/customerQueryOptions.ts` (list, count, recent, detail),
   `pages/parts/queries/partQueryOptions.ts` (list, count, detail), `pages/locations/queries/locationQueryOptions.ts`
   (users, locations)
7. `web/app/components/ErrorAlert.tsx`: busy → "still busy" (`during="load"`, the default) or the save message
   (`during="save"`)
8. `web/app/pages/customers/CustomerEdit.tsx`, `web/app/pages/parts/PartEdit.tsx`: a busy load shows `ErrorAlert`,
   not "not found at this location" (that stays for a 404); `web/app/pages/Home.tsx`: `ErrorAlert` at the top for its
   first busy query, the way the lists show theirs above the grid
9. `web/app/pages/parts/PartCreateDialog.tsx`: `bins.error` and `create.error` shown apart, `during="save"` on the
   save's; `CustomerList.tsx`, `PartList.tsx`: a list that failed says nothing in the grid (found in step 5)
10. `web/app/locales/en/common.json`, `web/app/locales/fr/common.json`: `errors.busyRetrying`, `errors.stillBusy`,
    `errors.busySave`
11. Tests: `core/config/__test__/apiErrors.test.ts` (**new**), `core/queries/__test__/queryClient.test.ts` (**new**),
    `web/e2e/busy.spec.ts` (**new**)

`RootErrorBoundary.tsx` is left as it is: every loader catches, so no busy error reaches it.

```ts
// apiErrors.ts
export function isBusyError(error: unknown): boolean {
  return error instanceof ApiError && error.type === PROBLEM_TYPE.busy;
}

// queryClient.ts
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isBusyError(error)) { return failureCount < BUSY_TRIES_AGAIN; }           // 2
  return failureCount < 1 && (isTransientError(error) || (error instanceof ApiError && error.status >= 500));
}
export function retryDelayMs(failureCount: number, error: unknown): number {
  return isBusyError(error) ? BUSY_RETRY_DELAY_MS : Math.min(1000 * 2 ** failureCount, 30_000); // TanStack's default
}

// busyQueries.ts
export function isRetryingBusy(queries: readonly Query[]): boolean {
  return queries.some((q) => q.state.fetchStatus === "fetching" && isBusyError(q.state.fetchFailureReason));
}

// BusyNotice.tsx: one boolean from the cache, so it renders only when that changes
export function BusyNotice() {
  const cache = queryClient.getQueryCache();
  const retrying = useSyncExternalStore((onChange) => cache.subscribe(onChange), () => isRetryingBusy(cache.getAll()));
  return <Snackbar open={retrying} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
    <Alert severity="info">{t("errors.busyRetrying")}</Alert></Snackbar>;
}

// customerQueryOptions.ts, each option a clientLoader fetches
detail: (locationId, customerId) => queryOptions({ queryKey: …, queryFn: …, retryOnMount: false }),
```

**Impact:** Breaking changes: None (saves were never retried; other errors retry as before; `retryOnMount: false`
changes only a page whose loader just failed, which today asks once more on showing) · Depends on: ACME-121's busy
answer · Performance: at most two more requests per busy page, a second apart, where today a failed loader is followed
by a second full round from the page; the cache subscription runs a `some` over the cached queries on each cache event

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                        | Proves                                                                                 |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Unit                    | `core/config/__test__/apiErrors.test.ts`    | busy known by its type, not its status (a database down is not busy); the save message |
| Unit                    | `core/queries/__test__/queryClient.test.ts` | busy: tries 2 and 3 yes, 4 no, 1 s apart; a 5xx once; a 4xx never; `isRetryingBusy`    |
| End to end (Playwright) | `web/e2e/busy.spec.ts`                      | every box above that a person sees, with the requests counted                          |

## Steps

- [x] 1. `isBusyError`, the save message, `shouldRetryQuery`, `retryDelayMs`, `isRetryingBusy`, tests first → verify:
      the unit tests fail, then pass
- [x] 2. `BusyNotice` in `RootLayout`; `retryOnMount: false` on the loaders' options; `ErrorAlert`'s
      `during`; the record pages, Home and the part dialog; the locales → verify: `bun run gate:fast`
- [x] 3. `busy.spec.ts`, each answering busy with `page.route` and counting the requests: Customers from the sidebar
      and by address (busy twice: the line, then rows, then no line; three requests), still busy (three requests, the
      message above the grid, no fourth within 3 s), sign-in to Home, a customer's and a part's page (busy then
      answered; still busy: not "not found"), Home still busy, a new customer's POST busy (fields kept, message, one
      POST) then saved by hand (one customer with that surname), a customer edit's PATCH busy (fields kept, one
      PATCH), the part dialog's bins and save → verify: the spec passes, and fails with `retryOnMount` taken out (Customers opened from inside the app by Home's
      shortcut: the sidebar's sections start folded)
- [x] 4. Calm: the existing e2e specs (`customers`, `parts`, `forms`, `edit-conflicts`) → verify: they pass unchanged
- [x] 5. Looked at: `check-in-browser` at 1440 and 1024, the line over a page, over the loading screen, and the save
      message (forced with the same `page.route` answers) → verify: screenshots read, nothing overlapping or cut off
- [x] 6. Live: `start:prod --load-test`, `load-test --rate 300 --people 20 --writes 5` (ACME-121's twice-capacity run),
      Customers opened and a customer added as sam in the browser → verify: the line seen, then the list or "still
      busy", never a long spinner; a busy save keeps its form; the customer added once afterwards
- [x] 7. `verify-ticket` → verify: `docs/evidence/ACME-122.md`, every box cited

## Questions

None: the interview settled the three (a notice on every page, two tries then "still busy", a busy save keeps its form
and is never sent again by itself); recorded in Decisions. "Still busy" on Home and the record pages follows how the
lists show a failed query (`ErrorAlert` at the top of the page).

## Decisions

- D1 A snackbar on every page, from one component reading the query cache, over a notice per page (interview, Zafar
  Ali, 8 Nov).
- D2 Two tries again about a second apart, then "still busy", over one or trying forever (interview).
- D3 A busy save is never sent again by itself, over retrying edits or every save (interview): sending again is the
  person's choice, and safe because busy is answered only before anything is written.
- D4 Busy is known by its problem type, not by 503: a database down (`service-unavailable`, also 503) keeps today's
  single retry and its own message.
- D5 `retryOnMount: false` on the options a clientLoader fetches, over letting the page ask again on showing: the
  loader runs on every visit, so it is the one place that tries; otherwise a busy page would try five times, not two.

## Log

- 2026-11-08 23:48 Plan written from ACME-122 and the 8 Nov interview answers (ACME-121/122 split). Read:
  `queryClient.ts` (one retry for transient and 5xx), `apiErrors.ts` (no busy type), `ErrorAlert.tsx`,
  `RootErrorBoundary.tsx`, `CustomerCreate.tsx` (a busy save already keeps its form: the action returns `{error}`
  and the form is not remounted), `PartCreateDialog.tsx` (a mutation; `ErrorAlert` shows its error),
  `prefetchListPage.ts` (list loaders swallow errors; the page's query shows them), `vitest.config.ts` (pure logic
  only; screens in Playwright).
- 2026-11-08 23:54 Architect: CHANGES, 7 findings, all taken. Loaders swallow errors and the page asked again on
  mount (five tries, not two): `retryOnMount: false` on the loaders' options (D5), the spec counts requests. The
  notice moved from `Layout` to root and the hydrate fallback (first load, sign-in to Home). Record pages showed a
  busy load as "not found" and Home showed nothing: both show `ErrorAlert`; `RootErrorBoundary` dropped (no loader
  throws). Every box now has a spec check (record pages, Home, an edit's PATCH, the dialog's two errors); "never a
  long spinner" is a box. The dialog's load and save errors apart. The api-errors citation and the
  `problemErrorMessage` note corrected.
- 2026-11-09 00:06 Go-ahead (Zafar Ali: "continue once the architect review is back"). Loaded the four rows. `RootLayout` wraps
  every page, the hydrate fallback and the error page, so the notice is mounted there once instead of in `root.tsx`
  and `RootHydrateFallback.tsx` (file 5).
- 2026-11-09 00:10 Step 1: `apiErrors.test.ts` and `queryClient.test.ts` failed first (no `busy` type, no `busyQueries`), then 12
  passed. `isBusyError`, `PROBLEM_TYPE.busy`, the save message in `problemErrorMessage`, `shouldRetryQuery`,
  `retryDelayMs`, `isRetryingBusy`; the three messages in English and French.
- 2026-11-09 00:10 Step 2: `BusyNotice` in `RootLayout`; `retryOnMount: false` on the 9 options loaders fetch; `ErrorAlert`
  `during`; the record pages show busy with `ErrorAlert`, not "not found"; Home shows its first busy query; the part
  dialog's two errors apart. `gate:fast` failed once on the gateway's `GatewayUnderTest.cs` from the draining commit
  (CA1861, an inline array; the earlier gate was served from the cache): fixed with a static field; then passed.
- 2026-11-09 00:18 Step 3: `busy.spec.ts`, 9 tests, all passed (57 s) after one fix to the test (it read the heading before the
  customer loaded). Each box: the line then rows, 3 list requests (from Home's shortcut and by address); still busy
  above the grid, 3 requests and no fourth in 3 s; sign-in to Home, 3 recent requests; Home still busy at the top;
  a customer's and a part's page, the line then the record, still busy and no "not found", 3 requests; a new
  customer's POST busy: fields kept, the message, 1 POST in 2.5 s, then by hand: 1 customer with that first name
  (API search); its PUT busy: field kept, 1 PUT; the part dialog: bins still busy (3), save "nothing was saved"
  (1 POST). With `retryOnMount: false` taken out of the customers options and the web rebuilt, the still-busy test
  failed: 6 requests, not 3; restored and rebuilt. The 4xx box: `queryClient.test.ts` (never retried).
- 2026-11-09 00:18 Step 4: the whole e2e suite against `start:prod --load-test`: 36 passed (1.5 min).
- 2026-11-09 00:23 Step 5: screenshots (1440, 1024; a Playwright script forcing busy as the spec does): the notice over Home while
  Customers is tried again, over the first-load spinner, "still busy" above the grid, the busy save with both names
  kept. Found: the failed grid said "No customers at Northside yet.", which is false; `CustomerList` and `PartList`
  now leave the grid's empty text blank when the list failed (the alert says what happened). Retaken: right; the
  notice was first caught mid fade-in (retaken after 400 ms). Nothing overlapping or cut off.
- 2026-11-09 00:23 Step 6: live, no faked answers. At 300 a second (90 s): 296 a second answered, 336 of 27,000 busy, p95 1.05 s:
  the browser (sam) opened Customers 12 times, rows each time in 0.4 to 1.6 s, never busy; 4 adds saved. At 450 a
  second (23,896 of 40,500 busy, 0 failed): the notice seen on all 12 openings; 11 ended "still busy" after about
  7.5 s (three busy answers of about 2 s, two waits of 1 s), 1 showed rows at 5.8 s; never a bare spinner. The 4 adds
  saved in about 140 ms (saves keep their own connections): a busy save was not seen live, only in the spec.
- 2026-11-09 00:36 Step 7: verifier PASS, every requirement (live at 450 a second: the line at 1.86 s, 3 requests 1.00 s apart,
  "still busy" at 7.06 s; forced: list, Home, customer page, part dialog; a busy save keeps all 7 fields, saved once
  by hand; a 400 and a database-down 503 as before; screens at both widths). Caveat: no save was busy for real (85
  adds at 450 a second all saved). Its one note, a stray "keys. *" in two doc comments, fixed. Evidence:
  `docs/evidence/ACME-122.md`.
