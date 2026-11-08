# ACME-106: "Recently contacted" shows customers from another location

**Created:** 2026-11-06 19:32

**Status:** Done

**Ticket:** ACME-106 · **Branch:** final

**Scope:** Medium (4-8) · **Layers:** Backend

**Design:** Follows: the "Recently contacted" panel on the home page (`web/app/pages/Home.tsx`), unchanged

**Now:** Done: the home page lists only the selected location's customers, newest contact first, and each one opens ·
Next: none · Blocked: None

## Requirement

Maria (Service Manager, Riverside) sees people in "Recently contacted" she has never dealt with, and clicking one says
"Customer was not found at this location". Riverside staff must only ever see Riverside customers. This is a data
protection problem, not just an annoyance.

- **In:** the list shows only the customers of the location selected in the top bar, and the same mistake cannot
  slip through again unnoticed.
- **Out:** the Customers list and the customer page. They already refused other locations' customers.

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log. One line each: a verb, then what is seen.

Happy

- [x] Sign in as `maria` at Riverside, open Home → every name in "Recently contacted" is also in Riverside's
      Customers list, newest contact first
- [x] Sign in as `sam` at Northside, open Home → every name is also in Northside's Customers list, and none is on
      Maria's list
- [x] Click any name in the list → the customer opens, with no error

Failure: invalid input, absent data, not allowed, another service down

- [x] Ask for the list with no location selected → it is refused with a bad request, not an empty or a wider list
- [x] Run the query with no filter written in it → still only this location's customers come back (the database does
      the filtering, so a forgotten filter cannot leak)
- [x] Add a table with no policy → a test fails until it has one

## Load before building

| Item                                                                                                  | Kind     | Why                                                        | Loaded? |
| ----------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------- | ------- |
| `build-api-endpoint`                                                                                  | Skill    | the handler, its test and the controller                   | [x]     |
| `docs/standards/multi-tenancy.md` "Dealers and their locations"                                       | Standard | a location's customers belong to that location             | [x]     |
| `docs/standards/multi-tenancy.md` "The database enforces it too: row-level security (dealership-api)" | Standard | the scope is the table's policy, not the handler's `where` | [x]     |
| `docs/standards/business-handlers.md` "Data access: a unit of work, no repositories"                  | Standard | how a handler opens its unit of work                       | [x]     |

## Shape

**Follows:** the other customer query handlers, such as `get-customer.query-handler.ts` · **Deviates:** None

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/get-recent-customers.query-handler.ts`:
   needs a selected location; reads only live customers who have a last contact date, newest first
2. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/__test__/get-recent-customers.query-handler.test.ts`:
   seeds the rows that must not come back
3. `backend/dealership-api/src/persistence/migrations/drizzle/20261106151216_row_level_security/migration.sql`
   (**new**): the `dealership_api_user` role and one policy per table, including `customers_dealer_location`
4. `backend/dealership-api/src/persistence/unit-of-work/unit-of-work.factory.ts`: a request's transaction works as
   that role, with the dealer, location and user set
5. `backend/dealership-api/src/request-scope/data-scope.ts` (**new**): the scope a request carries
6. `backend/dealership-api/src/service/middleware/data-scope.middleware.ts` (**new**): gives each request an empty scope
7. `backend/dealership-api/src/service/guards/authorization.guard.ts`: fills the scope in from the token
8. `backend/dealership-api/src/test-setup/postgres/as-request.ts` (**new**): `asRequest(handler)`, so tests run a
   handler as a request does
9. `backend/dealership-api/src/persistence/unit-of-work/__test__/row-level-security.test.ts` (**new**): proves the
   policies, and fails when a table has none

High-level code: the handler asks for a location, then names only what is its own business. It does not name the
dealer or the location.

```ts
// get-recent-customers.query-handler.ts
export const RECENT_CUSTOMERS_LIMIT = 5;

public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
  requireLocation(userContext); // no location selected: BadRequestException
  await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
  const recent = await work.db
    .select()
    .from(customers)
    .where(and(isNotNull(customers.lastContactDate)))
    .orderBy(desc(customers.lastContactDate), asc(customers.surname), asc(customers.id))
    .limit(RECENT_CUSTOMERS_LIMIT);
  return recent.map(toCustomerListItemDto);
}
```

The policy on `customers` is what keeps the rows to one dealer and one location. A setting that is missing is NULL,
which matches no row.

```sql
CREATE POLICY "customers_dealer_location" ON "customers" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid)
  WITH CHECK (...same two conditions...);
```

```ts
// unit-of-work.factory.ts: inside a request, one round trip sets the role and the scope for this transaction
if (!options.asOwner && (scope || isInRequest())) {
  await client.query(
    `${begin}; SELECT set_config('role', ${literal(REQUEST_ROLE)}, true), ` +
      `set_config('app.dealer_id', ${literal(scope?.dealerId ?? "")}, true), ` +
      `set_config('app.location_id', ${literal(scope?.locationId ?? "")}, true), ...`,
  );
}
```

**Impact:** Breaking changes: `GET /customers/recent` now answers 400 when no location is selected (the web page
always sends one: `getRecentCustomersAsync` in `web/app/pages/customers/queries/customerQueries.ts`) · Depends on:
the `row_level_security` migration · Performance: the policy's conditions join the same `WHERE`, so the customers
indexes are used as before; the list is cut to 5 rows.

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                                                                                                          | Proves                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler (real Postgres) | `backend/dealership-api/src/business-logic/handlers/customers/get-recent/__test__/get-recent-customers.query-handler.test.ts` | Northside gets Byrne, Doyle; Riverside gets Farooq. Never contacted, deleted, another location and another dealer stay out. No location is refused |
| Database policy         | `backend/dealership-api/src/persistence/unit-of-work/__test__/row-level-security.test.ts`                                     | a request sees only its location's customers with no filter in the query; no scope sees no row; every table has a policy                           |
| Request wiring          | `backend/dealership-api/src/service/__test__/data-scope.test.ts`                                                              | a real request's queries are filtered by the dealer and location its guard recorded                                                                |
| Handlers, other lists   | `backend/dealership-api/src/business-logic/handlers/__test__/tenant-isolation.test.ts`                                        | other handlers hide another dealer's and another location's rows too                                                                               |

There is no Playwright test for the home panel. The browser check is in `docs/qa/ACME-106.md`.

## Steps

- [x] 1. Reproduce: seed another location's and another dealer's customers in the handler test → verify: it fails on the
      old handler, which filtered by neither
- [x] 2. Make the handler need a selected location and filter by dealer and location → verify: the handler test passes
- [x] 3. Add row-level security: the role, the policies and the migration → verify: `row-level-security.test.ts` passes
- [x] 4. Open each request's transaction as that role, with the scope the guard recorded → verify: `data-scope.test.ts`
      passes
- [x] 5. Remove the hand-written dealer and location conditions from the handler → verify: the handler test still passes
      when run through `asRequest`
- [x] 6. Fail a build when a table has no policy → verify: the policy-coverage test in `row-level-security.test.ts`
- [x] 7. Write the rule down → verify: `docs/standards/multi-tenancy.md` describes the policies

## Questions

None.

## Decisions

- D1 Scope by a database policy, not by a `where` in each handler: a handler that forgets a filter then returns
  nothing it should not, which answers "cannot slip through again unnoticed". The cost is one migration and a test
  wrapper (`docs/standards/multi-tenancy.md`).
- D2 A request with no location selected is refused (400), not shown an empty list: an empty list would hide a
  missing location.
- D3 A request whose scope was never set sees no business row at all, rather than every dealer's rows.

## Log

- 2026-11-06 19:32 Commit `5336dcf`: the handler now needs a location and filters by dealer and location; its test
  seeds another location's, another dealer's, a deleted and a never-contacted customer, and fails on the old handler.
  The order now ends with the id, so two customers last contacted the same day keep their order.
- 2026-11-06 20:16 Commit `f196dd2`: row-level security, so Postgres keeps each request to its dealer and location.
  Adds `row-level-security.test.ts` and `data-scope.test.ts`.
- 2026-11-06 20:54 Commit `82fd7e8`: handlers stop repeating the dealer and location, and a request with no scope sees
  nothing. The handler test now runs through `asRequest`, so it proves the policy and the handler together.
- 2026-11-06 22:25 Commit `47ca19a`: soft delete is a policy too, so the handler no longer writes `notDeleted`.
- 2026-11-07 01:03 Commit `483aa1c`: the soft-delete policy is a plain `NOT is_deleted`, so partial indexes are usable
  again.
- QA, from `docs/qa/ACME-106.md`: PASS. As `maria` at Riverside, all 5 names are in Riverside's list, newest
  first. As `sam` at Northside, all 5 are in Northside's list and none is among Maria's. Clicking a name opens
  the customer, and the API answers 404 for another location's customer. Not tested there: the "no location" 400
  (the `api` tool always sends a location); the handler test covers it.
