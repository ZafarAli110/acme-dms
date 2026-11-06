# Plan: scope by the database, not by every query

Branch: `final` only. Not on `main` or the labs: ACME-106 (a missing location filter) is a ticket the room fixes by
hand, and the labs teach that.

## Why

dealership-api filters every query by `userContext.dealerId` (and the location) in its own `where`: about 33 conditions
in 12 files. Row-level security (migration `0004`) already makes Postgres do the same for a request, so each hand-written
condition repeats what the policy enforces, and a handler that forgets one is only saved by the policy. The repeats add
noise, and they invite the next copy to drift (`customerListWhere` takes a dealer and a location as arguments).

We want: **a handler says what is its own business (search, soft delete, rules), and the database says whose rows they
are.** No repository layer: handlers keep querying with Drizzle through the unit of work.

## Decisions

1. **Scope lives on the table, as a policy.** Each table's policy says how it is shared:
   - dealer and location (customers, bins, part_inventories): one rooftop's rows;
   - dealer only (parts, part_photos): shared by the dealer's locations;
   - owner too (export_jobs): the user's own;
   - no policy (processed_messages): no dealer, the consumer's bookkeeping.

   A feature that shares a location or a dealer differently gets a different policy on its table, never a handler
   exception. No new `app.*` setting is added now: a feature that must read across locations will add one with its own
   review (`app.location_ids`, a list). That is the extension point, not part of this change.

2. **A request with no scope sees nothing.** Today `UnitOfWorkFactory` works as the table owner (unfiltered) when no
   scope is set. That is right outside a request (export worker, consumer, seed, migrations) and wrong inside one: a
   request whose guard did not run would read every dealer's rows once the hand filters are gone. Inside a request
   without a scope the transaction works as the request role with empty settings, which matches no row.
3. **Handlers drop the dealer and location conditions** on tables with a policy: bins, customers, parts,
   part_inventories, part_photos. They keep `notDeleted`, ids, search and every business rule. An insert still sets
   `dealerId`/`locationId` from `userContext`; the policy's `WITH CHECK` refuses a mismatch.
4. **Code outside a request filters by hand, and says so.** The export worker reads customers as the owner: the
   customer export source adds the dealer and the location itself. The photo consumer handlers (`mark-photo-ready`,
   `mark-photo-failed`) keep their `dealerId`.
   `customerListWhere` stops taking a dealer and a location; the export source adds them.
5. **A test fails when a table has no policy.** Every table in `public` has row-level security enabled and a policy for
   the request role, or is on a short allow-list with the reason (`processed_messages`, the Drizzle migrations table).
   This replaces "a reviewer remembers to check every query".
6. **Handler tests run as a request.** `database.asRequest(handler)` wraps a handler so each `executeAsync(userContext,
…)` runs inside that user's data scope, as the guard does in production. Handler tests then prove the policy plus the
   handler together. Tests for the consumer and export handlers stay unscoped (they run outside a request).
7. **The docs say the new rule**: `CLAUDE.md`, `docs/standards/multi-tenancy.md`, the `build-api-endpoint` skill, and
   the clean-code, security and performance reviewers. The security reviewer's rule flips: a query that adds the dealer
   by hand is noise; a new table without a policy, a request using the owner role, or code outside a request that
   forgets to filter is the finding.

## Steps

1. `data-scope.ts`: `isInRequest()`. `UnitOfWorkFactory`: in a request with no scope, use the request role with empty
   settings. Tests in `row-level-security.test.ts`.
2. Test support: `asRequest` on `useTestDatabase()`.
3. Every handler test that builds a request-path handler wraps it with `asRequest`. Run: they must still pass before
   any filter is removed (proves the wrapper).
4. Remove the hand-written conditions, handler by handler; change `findStockedPartsAsync`, `findStockedPartAsync`,
   `findPhotosAsync`, `customerListWhere` signatures; the export source adds its own scope.
5. The policy-coverage test.
6. Docs.
7. Run the dealership-api tests, typecheck, format, `docs:check`.

## Risks and checks

- **Silently reading too much.** A handler that runs with no scope sees everything. Mitigated by decision 2 (requests)
  and by `asRequest` in tests; code outside a request is listed in decision 4 and must filter.
- **Insert into a table with a policy** needs `WITH CHECK` to pass: the values come from `userContext`, the same as the
  scope, so they match. Covered by the create-handler tests running scoped.
- **Joins**: the policy applies to every table in a query. `part_inventories` joined to `parts` and `bins` is scoped on
  each table; the results do not change.
- **Plans**: the policy conditions are added to the same `WHERE`; the index plans were measured the same with the policy
  (see the deep-offset change).
- **The labs and main are unchanged** and keep the hand-written filters and the old docs.

## Review (an independent read of the plan against the code) and what changed

- **Blocker, fixed:** the signed export download (`ExportQueue.fileForLinkAsync`, a `@Public()` route) has no token and so
  no scope; it relied on the owner role. With decision 2 it would have answered 403 for every download, and no test
  caught it (it was called outside a request). It now asks for `beginAsync({ readOnly: true, asOwner: true })`, the one
  use of that option, and its test runs it inside a request with no scope.
- **Request scope survives timers and callbacks started inside a request** (async context): a test shows it. Code that
  loses the context (a listener registered outside the request) is "outside a request" by definition: it must name the
  dealer itself.
- **Step order:** the policy-coverage test and the handler isolation test (`handlers/__test__/tenant-isolation.test.ts`,
  City Motors' rows beside Northwind's) were added after the filters went, and were checked to fail without the request
  wrapper.
- **Ids stay looked up in the handler** (a part, a bin): a foreign key ignores row-level security, so the policy-filtered
  lookup is what refuses another dealer's id.
- **Found by the review, fixed in migration `0006`:** `ExportQueue.enqueueAsync` ran under the `export_jobs` policy (dealer,
  location, owner) while its hand filters were dealer and owner, so a key reused at another location gave a 500 (the
  unique index) instead of a 422, and the per-user limit was counted per location. The key and the limit are the
  user's across locations, so two `SECURITY DEFINER` functions (`export_key_in_use`, `export_active_count`) answer
  them from the request's own settings (no argument names a dealer or a user). The queue's other lookups (get, cancel,
  list) now rely on the policy too; an export is seen at the location it was started from, as the policy always said.

## Not in this change

Cross-location reads (`app.location_ids`), declaring policies in the Drizzle schema (`pgPolicy`), the .NET services (EF
Core's global filter already does this for them).
