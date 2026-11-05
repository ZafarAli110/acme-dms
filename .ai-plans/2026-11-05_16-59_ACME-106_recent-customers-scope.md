# ACME-106: "Recently contacted" shows customers from another location

**Created:** 2026-11-05 16:59

**Status:** Done (verified; pull request and QA to follow)

**Ticket:** ACME-106 · **Branch:** ACME-106 (base: `lab/10-ticket-to-pr`)

**Scope:** Small (1-3 files) · **Layers:** Backend

**Design:** No screen. The Home panel is unchanged; only the rows the API returns change.

**Now:** Done: ticket read, cause found by reading the code · Done: handler filters by dealer and location, 6 handler tests pass · Done: steps 1-3, checked in the running system · Evidence: `docs/evidence/ACME-106.md` · Next: `/qa-ticket ACME-106`, then a person merges PR #3 · Blocked: None

## Requirement

On the home page, "Recently contacted" must list only the customers of the location selected in the top bar, newest
contact first, and every one must open. Today it lists customers of every location and of every dealer.

- **In:** `GET /v1/customers/recent` filters by the caller's dealer and selected location; tests that fail if either
  filter is dropped.
- **Out:** the web app (its query key already includes the location, `customerQueryKey.ts`); a guard across all handlers
  (question 1).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] As `maria` at Riverside, open Home → every name in "Recently contacted" is in Riverside's Customers list
- [x] As `sam` at Northside, open Home → every name is in Northside's list and none is on Maria's list
- [x] Click each name in the panel → the customer opens, no "not found" error
- [x] The panel shows the newest contact first, at most 5

Failure: absent data, not allowed, another dealer

- [x] As `tom` (City Motors, Central) → sees none of Northwind's customers; a Northwind customer id is "not found" for him
- [x] A location with no contacted customers → an empty list, not another location's rows
- [x] No `x-location-id` → 400, like the customer list (via `requireLocation`)

## Load before building

| Item                              | Kind     | Why                                         | Loaded?                                           |
| --------------------------------- | -------- | ------------------------------------------- | ------------------------------------------------- |
| `docs/standards/multi-tenancy.md` | Standard | dealer and location filter in every `where` | [x]                                               |
| `build-api-endpoint`              | Skill    | handler and test shape                      | [ ] not loaded: followed the sibling list handler |

## Shape

**Follows:** `get-customer-list.query-handler.ts` (dealer + location in the `where`) · **Deviates:** None

Cause: `GetRecentCustomersQueryHandler.executeAsync()` takes no `userContext`; its `where` is only
`lastContactDate is not null` and not deleted. The interface and controller already pass `userContext`, so they stay.
A sweep of every handler for `dealerId` and `requireLocation` found no other missing filter (the ones without
`requireLocation` are system and part-photo handlers: dealer-wide data).

Files:

1. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/get-recent-customers.query-handler.ts`:
   take `userContext`, add the two filters
2. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/__test__/get-recent-customers.query-handler.test.ts`:
   seed the rows that must not come back

```ts
public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
  const locationId = requireLocation(userContext); // 400 when none is selected
  await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
  const recent = await work.db.select().from(customers)
    .where(and(
      eq(customers.dealerId, userContext.dealerId),
      eq(customers.locationId, locationId),
      isNotNull(customers.lastContactDate),
      notDeleted(customers)))
    .orderBy(desc(customers.lastContactDate), asc(customers.surname)).limit(RECENT_CUSTOMERS_LIMIT);
  return recent.map(toCustomerListItemDto);
}
```

`requireLocation` is in `backend/dealership-api/src/business-logic/user-context/require-location.ts` (the list handler imports
it as `../../../user-context/require-location`); `AT_NORTHSIDE`,
`AT_RIVERSIDE` are in `#test-setup/users/test-users`; `CENTRAL` and `addCustomerAsync` are in the seed kit.

**Impact:** Breaking changes: None for the web app (it already sends the location). Only callers without a location now
get 400 · Depends on: nothing · Performance: limit 5, filtered by dealer and location; no new query.

## Tests

| Kind                    | File                                         | Proves                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Handler (real Postgres) | `get-recent-customers.query-handler.test.ts` | Northside's call returns only Northside's, newest first; not Riverside's, not City Motors', not deleted, not never-contacted; a location with no contacted customers gets `[]`; a user with no location is refused (400) |

## Steps

- [x] 1. Write the tests: Northside, Riverside and Central (City Motors) customers contacted, plus a deleted one and a
      never-contacted one; call as `AT_NORTHSIDE`, `AT_RIVERSIDE` and a Central user; a location with no contacted
      customers (Westgate) returns `[]`; a user context with no location is refused → verify: they fail on the current
      handler, showing the leak
- [x] 2. Add `userContext`, `requireLocation` and the dealer filter to the handler → verify:
      `bunx nx test @acme/dealership-api` passes
- [x] 3. Check it in the running system → verify, each with `bun run api as <user> [--location <x>] GET <path>`:
      (a) `maria --location riverside` `GET /api/dealership/v1/customers/recent`: every name is in her Riverside
      `GET …/customers` list; (b) `sam` (Northside): every name is in his Northside list and none is in (a);
      (c) `GET …/customers/{id}` for every id returned in (a) and (b), as the same user at the same location: all
      200; (d) `rita --location westgate`: only Westgate customers; (e) `tom`: none of Northwind's customers, and
      `GET …/customers/{a Northwind id}` is 404; (f) a call without a location: 400; `bun run errors` shows nothing
      new

## Questions

1. What should "The same mistake cannot slip through again unnoticed" cover? Checked: the ticket, `multi-tenancy.md`
   and the handlers (this one's test seeded only Northside rows, which is why the leak went unnoticed; every other
   handler filters). **A (recommended):** regression tests on `GET /v1/customers/recent` seeding another location's,
   another dealer's, deleted and never-contacted customers; a guard across all handlers goes to a follow-up ticket.
   **B:** also add, in this ticket, a guard that fails any dealership-api handler whose query lacks `dealerId` or
   `requireLocation`: catches the next one too, but is a wider change across every handler.

## Decisions

- D1 "The same mistake cannot slip through again unnoticed": a person answered **A** on the ticket (2026-11-05 12:01 UTC): regression tests on this endpoint; a guard across all handlers is not in this ticket (follow-up, no ticket yet).

## Log

- 2026-11-05 16:59 Plan written. Cause found by reading the handler; swept all handlers: no other missing filter.
- 2026-11-05 17:05 Architect round: CHANGES. Fixed: requireLocation path, tests for empty location and no location,
  step 3 now runs the ticket's checks per user and location and opens each returned customer, tom's Northwind id.
  D1 moved to Questions (a product reading of acceptance criterion 3). Run stops at the questions gate.
- 2026-11-05 17:02 Question 1 answered "A" on the ticket by a person. Building from step 1.
- 2026-11-05 17:04 Step 1: six tests written. On the old handler 5 of 6 failed, returning Riverside's and City Motors' customers to Northside (only "deleted and never contacted" passed). Tests clear `customers` before each test: the test database is shared by a file's tests.
- 2026-11-05 17:06 Step 2: handler takes `userContext`, `requireLocation`, dealer and location filters. `bunx nx test @acme/dealership-api --skip-nx-cache`: succeeded, all tests pass. Steps 1 and 2 are committed together: a commit of step 1 alone would hold failing tests.
- 2026-11-05 17:08 Step 3, running system (`bun run start`, `bun run reset`; calls with `bun run api as <user> --location <x> --body GET …`; the API script cannot omit the location, so "no location → 400" is proved by the unit test only):
  - maria @ Riverside: recent = 5 (Adeyemi 10-26, Doyle 10-23, Byrne 10-18, Nowak 10-11, Fischer 04-02), newest first; 0 ids missing from her Riverside list (7 customers); all 5 `GET /customers/{id}` 200.
  - sam @ Northside: recent = 5 (Patel 10-27 … Hopper 10-02); 0 missing from his list (10); all 5 open 200; 0 of his ids are on maria's recent or list.
  - rita @ Westgate: recent = 5, all Westgate; 0 missing from her list (6); all 5 open 200.
  - tom @ Central: recent = 2 (Farooq, Ahmed), none of Northwind's; `GET /customers/{Patel, Northside}` = 404 "was not found at this location".
  - `bun run errors`: one failed trace, `PUT /api/dealership/*` at 17:05:04, during startup seeding before my first call; not on the customers endpoints. Not investigated further.
  - No screen changed, so no browser screenshots.
- 2026-11-05 17:09 "No location → 400": ticked by the unit test "is refused when no location is selected" (BadRequestException), passing in the 17:06 run. The `build-api-endpoint` skill was not loaded; the sibling `get-customer-list` handler was followed.
- 2026-11-05 17:13 verify-ticket: `bun run gate:fast` passed (22/22, cached). Verifier: PASS on the API checks; the Home panel was not seen in a browser. Evidence: `docs/evidence/ACME-106.md`.
- 2026-11-05 17:14 PR #3 opened (https://github.com/ZafarAli110/acme-dms/pull/3). Review round 1 posted: security APPROVE, clean-code APPROVE, performance APPROVE-WITH-CHANGES (PERF-S1), test APPROVE-WITH-CHANGES (TEST-S1, TEST-S2); no blocking findings, none dropped as wrong.
- 2026-11-05 17:17 Round 1 answered: TEST-S1 fixed (a limit test; with the location filter removed 4 tests fail, including it; restored). PERF-S1 left open: ACME-110 (needs a migration). TEST-S2 left open: ACME-111 (no web code changed; the standard it cites is not in docs/standards). `bun run gate:fast` exit 0.
