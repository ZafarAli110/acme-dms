# ACME-106: "Recently contacted" shows customers from another location

**Created:** 2026-11-05 10:00

**Status:** In progress

**Ticket:** ACME-106 · **Branch:** ACME-106 (base: practice/acme-106)

**Scope:** Small (1-3 files) · **Layers:** Backend

**Design:** No screen

**Now:** Done: handler fixed, 3 handler tests pass · Next: step 3, run as maria, sam, tom · Blocked: None

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

- [ ] As `maria` at Riverside, every name in "Recently contacted" is in Riverside's Customers list, newest first
- [ ] As `sam` at Northside, every name is in Northside's list and none is on Maria's list
- [ ] Every listed customer opens (`GET /v1/customers/{id}` is 200 at the same location)

Failure

- [ ] As `tom` (City Motors), none of Northwind's customers appear, and a Northwind id is "not found" for him
- [ ] Without a selected location, the endpoint answers 400, like the customer list
- [ ] A deleted customer, or one never contacted, does not appear

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
- [ ] 3. Run in the system as maria, sam, tom → verify: `bun run api as <user> GET /v1/customers/recent`, compare with the customers list, open each id; tom sees none of Northwind's
- [ ] 4. `bun run gate:fast` and `bun run errors` → verify: pass, nothing new

## Questions

None. Q1 answered on the ticket: A (2026-11-04, a person).

## Decisions

- None. The product owner chose scope A (regression test on this endpoint; the all-handler guard is a follow-up
  ticket). No selected location answers 400: `docs/standards/multi-tenancy.md` rule 4.

## Log

- 2026-11-05 10:00 Plan written; root cause read in code; ticket moved to in-progress.
- 2026-11-05 10:05 Architect: CHANGES. D1 moved to Questions (a product scope decision); D2 removed (the standard decides it). Status set to Waiting on answers.
- 2026-11-05 10:20 Q1 answered A by a person on the ticket. Status In progress; architect round already done, not rerun.
- 2026-11-05 10:40 Steps 1-2: test file rewritten (3 tests; the shared DB per file means one seed, read per user). Before the fix 4 of 5 assertions-tests failed (other location, other dealer leaked); after, `bunx nx test @acme/dealership-api -- get-recent` passes 3/3. Handler now filters dealerId + requireLocation.
