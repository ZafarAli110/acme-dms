# ACME-106: "Recently contacted" shows customers from another location

**Created:** 2026-11-05 10:00

**Status:** In progress

**Ticket:** ACME-106 · **Branch:** ACME-106 (base: practice/acme-106)

**Scope:** Small (1-3 files) · **Layers:** Backend

**Design:** No screen

**Now:** Done: fix verified in the running system, gate passes · Next: verify-ticket, then push and open the PR · Blocked: None

## Requirement

On the home page, "Recently contacted" must list only customers of the location selected in the top bar, newest
contact first, and every one must open.

- **In:** `GET /v1/customers/recent` filters by the user's dealer and selected location; a test that fails if either
  filter is dropped.
- **Out:** the web app (it already sends the location and keys its cache by it); a generic guard over all handlers.

**Root cause:** `get-recent-customers.query-handler.ts` takes no `userContext` and its `where` is only
`lastContactDate is not null and not deleted`. It returns the 5 newest customers of **every dealer and location**.
The interface and controller already pass `userContext`; the handler ignores it. So it also leaks **City Motors**
customers to Northwind, worse than the ticket says. A grep of all handlers for a missing `dealerId` found no other.

## Acceptance criteria: the goal

Happy

- [x] As `maria` at Riverside, every name in "Recently contacted" is in Riverside's Customers list, newest first
- [x] As `sam` at Northside, every name is in Northside's list and none is on Maria's list
- [x] Every listed customer opens (`GET /v1/customers/{id}` is 200 at the same location)

Failure

- [x] As `tom` (City Motors), none of Northwind's customers appear, and a Northwind id is "not found" for him
- [x] Without a selected location, the endpoint answers 400, like the customer list
- [x] A deleted customer, or one never contacted, does not appear

## Load before building

| Item                              | Kind     | Why                                   | Loaded? |
| --------------------------------- | -------- | ------------------------------------- | ------- |
| `docs/standards/multi-tenancy.md` | Standard | dealer and location filters per query | [x]     |
| `build-api-endpoint`              | Skill    | handler and test shape                | [ ]     |

## Shape

**Follows:** `get-customer-list.query-handler.ts` (`customerListWhere`) · **Deviates:** None

Files:

1. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/get-recent-customers.query-handler.ts`:
   take `userContext`, add the dealer and location filters
2. `.../get-recent/__test__/get-recent-customers.query-handler.test.ts`: new cases (existing one passes no user)

```ts
public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
  const locationId = requireLocation(userContext);   // 400 when none
  .where(and(
    eq(customers.dealerId, userContext.dealerId),
    eq(customers.locationId, locationId),
    isNotNull(customers.lastContactDate),
    notDeleted(customers)))
}
```

**Impact:** Breaking changes: None (same DTO, fewer rows) · Depends on: nothing · Performance: limit 5, unchanged.

## Tests

| Kind                    | File                                               | Proves                                                                                                                        |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Handler (real Postgres) | `get-recent/__test__/get-recent-customers…test.ts` | only the user's location, newest first; excludes other location, other dealer, deleted, never-contacted; 400 with no location |

## Steps

- [x] 1. Rewrite the test with rows that must not come back (Riverside, Central/City Motors, deleted, never contacted) → verify: `bunx nx test @acme/dealership-api` fails on the new cases
- [x] 2. Fix the handler → verify: same command passes
- [x] 3. Run in the system as maria, sam, tom → verify: `bun run api as <user> GET /v1/customers/recent`, compare with the customers list, open each id; tom sees none of Northwind's
- [x] 4. `bun run gate:fast` and `bun run errors` → verify: pass, nothing new

## Questions

None. Q1 answered on the ticket: A (2026-11-04, a person).

## Decisions

- D1 The verifier found the top 5 changed between calls when customers tie on date and surname (the sort ended at
  surname). Added `asc(customers.id)` as the last sort key, as the customer list does, with a test that fails without it.
  Small and in the same line, but nobody asked for it: a person can disagree.
- The product owner chose scope A (regression test on this endpoint; the all-handler guard is a follow-up
  ticket). No selected location answers 400: `docs/standards/multi-tenancy.md` rule 4.

## Log

- 2026-11-05 10:00 Plan written; root cause read in code; ticket moved to in-progress.
- 2026-11-05 10:05 Architect: CHANGES. D1 moved to Questions (a product scope decision); D2 removed (the standard decides it). Status set to Waiting on answers.
- 2026-11-05 10:20 Q1 answered A by a person on the ticket. Status In progress; architect round already done, not rerun.
- 2026-11-05 10:40 Steps 1-2: test file rewritten (3 tests; the shared DB per file means one seed, read per user). Before the fix 4 of 5 assertions-tests failed (other location, other dealer leaked); after, `bunx nx test @acme/dealership-api -- get-recent` passes 3/3. Handler now filters dealerId + requireLocation.
- 2026-11-05 11:05 Step 3, in the running system through the gateway (`/api/dealership/v1/customers/recent`), script in the scratchpad:
  maria@Riverside 5 names, sam@Northside 5, rita@Westgate 5, tom@Central 2 (all of his contacted customers), all newest first.
  Each id opens (200) at its own location and is found in that location's customer list (by phone, or email when the phone is null; tom's two are in his full list of 3).
  0 ids shared between maria's and sam's lists. Maria's 5 ids as sam: 5x 404; sam's 5 as maria: 5x 404.
  tom opening the 15 Northwind ids of maria, sam and rita: 15x 404. (An earlier 404 on the endpoint was my wrong path: the gateway needs `/api/dealership`.)
- 2026-11-05 11:08 Step 4: `bun run gate:fast` 22/22 tasks succeeded; `bun run errors` "No traces found". The pre-commit hook's `consistent-function-scoping` warning in the test fixed (helper moved to module scope).
- 2026-11-05 11:08 No screen changed (backend only; the web app already sends the location and keys its cache by it), so no screenshots.
- 2026-11-05 11:40 verify-ticket, verifier: PASS, with two gaps it named. (1) Mutation check, run by me: dropping the dealer filter fails 1 test, the location filter 2, notDeleted 1, the never-contacted filter 1; baseline 3/3 pass; file restored. (2) Tie order: before the fix the API and the home page showed different top 5 for the same state. New test (same surname and date, ids inserted in reverse) failed first, then passed with `asc(customers.id)`; 4/4 pass; `gate:fast` exit 0; three calls as sam return the same 5 ids; `bun run errors` clean.
