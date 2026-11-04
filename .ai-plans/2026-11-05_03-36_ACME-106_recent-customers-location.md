# ACME-106: "Recently contacted" shows customers from another location

**Created:** 2026-11-05 03:36

**Status:** In progress

**Ticket:** ACME-106 · **Branch:** acme-106

**Scope:** Small (1-3 files) · **Layers:** Backend

**Design:** No screen (the home page panel is unchanged; only the rows it receives change)

**Now:** Done: ticket read, bug located (`get-recent-customers.query-handler.ts` ignores `userContext`) · Next: step 5 (verify-ticket) · Blocked: None

## Requirement

Maria (Riverside) sees people she never dealt with in "Recently contacted" and gets "Customer was not found at this
location" on click. Riverside staff must only see Riverside customers.

- **In:** `GET /v1/customers/recent` returns only the caller's dealer and selected location, newest contact first; a regression test that fails if either filter goes.
- **Out:** the home page, the customer list and detail handlers (already filtered); a lint or architecture rule for missing filters (see D1).

## Acceptance criteria: the goal

Happy

- [x] As `maria` at Riverside, open Recently contacted → every name is also in Riverside's Customers list
- [x] As `sam` at Northside → every name is in Northside's Customers list and none is on Maria's list
- [x] Click any name in the panel → the customer opens, no error

Failure: invalid input, absent data, not allowed

- [x] As `tom` (City Motors, Central) → sees none of Northwind's customers; Northwind's customer id is "not found" for him
- [x] Call with no location selected → 400 "Select a location"
- [x] "The same mistake cannot slip through again unnoticed" (ticket criterion 3) → removing the dealer filter, or the location filter, from the handler makes a test fail; scope of "the same mistake": see Question 1
- [x] A deleted customer, a customer with no last contact date → not listed

## Load before building

| Item                              | Kind     | Why                                         | Loaded? |
| --------------------------------- | -------- | ------------------------------------------- | ------- |
| `docs/standards/multi-tenancy.md` | Standard | dealer and location filter in every `where` | [x]     |
| `build-api-endpoint`              | Skill    | handler and test pattern                    | [ ]     |

## Shape

**Follows:** `get-list/get-customer-list.query-handler.ts` (`eq(dealerId)`, `requireLocation`) · **Deviates:** None

Files:

1. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/get-recent-customers.query-handler.ts`: take `userContext`, filter by dealer and location.
2. `backend/dealership-api/src/business-logic/handlers/customers/get-recent/__test__/get-recent-customers.query-handler.test.ts`: other-location, other-dealer, deleted rows; no-location 400.

The interface and controller already pass `userContext`; the web hook already keys the query by location. No change.

```ts
public async executeAsync(userContext: UserContext): Promise<CustomerListItemDto[]> {
  const locationId = requireLocation(userContext);
  await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
  const recent = await work.db.select().from(customers)
    .where(and(
      eq(customers.dealerId, userContext.dealerId),
      eq(customers.locationId, locationId),
      isNotNull(customers.lastContactDate),
      notDeleted(customers)))
    .orderBy(desc(customers.lastContactDate), asc(customers.surname))
    .limit(RECENT_CUSTOMERS_LIMIT);
  return recent.map(toCustomerListItemDto);
}
```

**Impact:** Breaking changes: None · Depends on: nothing · Performance: limit 5, filtered by dealer and location, same columns the list uses.

## Tests

| Kind                    | File                                                             | Proves                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler (real Postgres) | `get-recent/__test__/get-recent-customers.query-handler.test.ts` | Riverside user gets only Riverside rows; another location's, another dealer's row seeded at the caller's own location (`dealerId` override, so only the dealer filter can exclude it), another location's row, and a deleted row never come back; no location → 400 |

## Steps

- [x] 1. Extend the test with the other-location, other-dealer, deleted and no-location cases → verify: `bunx nx test @acme/dealership-api` fails on the other-location, other-dealer and no-location cases (the deleted case already passes today: `notDeleted` is there); then each filter is removed in turn to see its case fail
- [x] 2. Add the dealer and location filters to the handler → verify: same command passes
- [x] 3. Run in the system as maria, sam, tom (`bun run api as <user> GET /v1/customers/recent`, `--location` where needed), compare with the Customers list → verify: acceptance rows; `bun run errors` shows nothing new
- [x] 4. Look at the home page panel as maria and sam at 1440 and 1024 wide (`check-in-browser`) → verify: names match the list, nothing overlaps
- [ ] 5. `verify-ticket acme-106` → verify: `bun run gate:fast` passes, evidence file written

## Questions

None open. Question 1 (scope of "the same mistake") was answered A on the ticket.

## Decisions

- D1 "Cannot slip through again" means this endpoint: a regression test that fails if either filter is removed. The check across all handlers is a follow-up ticket. Answered A by a person on the ticket.

## Log

- 2026-11-05 03:36 Plan written from the ticket; no open questions.
- 2026-11-05 03:38 Architect round: CHANGES. Fixed: criterion 3 added as an acceptance box; other-dealer test row seeded at the caller's location so only the dealer filter excludes it; step 1 names the cases that must fail. Moved the scope of "the same mistake" from Decisions to Questions (1). Stopping at the questions gate.
- 2026-11-05 03:39 Question 1 answered "A" on the ticket; recorded as D1. Starting step 1.
- 2026-11-05 03:40 Step 1: new tests failed on other-location, other-dealer and no-location (2 of 3 failed). Step 2: filters added; 3 of 3 pass. Removing the dealer filter fails 1 test, removing the location filter fails 1 test.
- 2026-11-05 03:45 Step 3, `bun run api as <user> --body GET /api/dealership/v1/customers/recent`: maria@Riverside, sam@Northside, rita@Westgate got 5 customers each, 0 ids shared between any two of them; tom (Central) got his 2. Every id opened (200) for its own user; Northwind's 15 ids were 404 for tom, maria's 5 were 404 for sam and sam's 5 for maria@Riverside. `bun run errors`: no traces with errors.
- 2026-11-05 03:45 Step 4, playwright-cli as maria: Northside panel showed Northside's ids, after the top-bar switch Riverside's five (the same ids the API returned); clicking Yasmin Ahmed opened her page, no error. Screenshots at 1440 and 1024 read: nothing overlaps or is cut off, no horizontal scroll (1024 vs 1024).
- 2026-11-05 03:45 Seen, not fixed (not asked): customers who share a contact date and surname tie in `orderBy(lastContactDate desc, surname asc)`, so which tied customer fills the last of the five rows can change between loads (Kieran vs Connor Ashhurst). A stable tie-break (id) is a one-line follow-up; a person decides.
