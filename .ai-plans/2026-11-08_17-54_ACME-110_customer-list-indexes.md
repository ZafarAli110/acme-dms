# ACME-110: The customer list stays quick at our biggest location

**Created:** 2026-11-08 17:54

**Status:** Verifying

**Ticket:** ACME-110 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Backend

**Design:** No screen. The Customers list looks and behaves as before; only its queries change.

**Now:** Done: every list query's plan uses the new indexes at 120,000 customers, under row-level security, and the
existing list tests pass · Next: Zafar Ali times the list at 1.6 million (`bun run seed:bulk`, `bun run sql:explain
--as sam`, `bun run load-test`) · Blocked: None

## Requirement

At Northside, with more than a million customers, the Customers list opens, pages, sorts by name or last contact,
filters and searches by surname within about a second, as it does at a small location, and shows the same customers.

- **In:** indexes that fit the list's queries; the list's queries shaped so the indexes can serve them.
- **Out:** sorts by company, email, phone or city (not in the ticket); an estimated total instead of the exact one.

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Open Customers at Northside → page 1 comes from the name index, 25 entries read, never the whole location
- [x] Go to the deepest page (row 10,000, the list's limit) → the skip happens in the index, without reading the table
- [x] Sort by name either way, or by last contact → each from its index, never a sort of the whole location
- [x] Filter by status or city → the page is found without reading the whole table
- [x] Search for a surname → the trigram index finds the matches and counts them
- [x] The list shows the same customers in the same order → the existing list and sort-filter tests pass unchanged
- [ ] Each of the above answers within about a second at 1.6 million customers → not measured yet

Failure: invalid input, absent data, not allowed, another service down

- [x] Another location's or a deleted customer never shows, the search included → row-level security still reads the rows
- [ ] Adding a customer at Northside is no slower → not measured yet (three indexes to keep up instead of two)
- [ ] Applying the change at Northside never stops the front desk → the migration follows the big-table rules; not rehearsed

## Load before building

| Item                                                    | Kind     | Why                                              | Loaded? |
| ------------------------------------------------------- | -------- | ------------------------------------------------ | ------- |
| `docs/standards/database.md` "Migrations on big tables" | Standard | lock timeout, building an index without blocking | [x]     |
| `docs/standards/multi-tenancy.md`                       | Standard | row-level security, when to work as the owner    | [x]     |

## Shape

**Follows:** the existing `ix_customers_location_name` (partial, live rows) and the export's owner-side filters ·
**Deviates:** a search's ids and count are found as the owner (see Decisions)

Files:

1. `backend/dealership-api/src/persistence/schema/customers.ts`: three indexes replace two; `customerSearchText`.
2. `backend/dealership-api/src/business-logic/list-query/list-columns.ts`: a column can sort by its own columns.
3. `backend/dealership-api/src/business-logic/handlers/customers/get-list/get-customer-list.query-handler.ts`: ids
   first, then rows; the search path.
4. `backend/dealership-api/src/persistence/migrations/drizzle/20261108125543_pg_trgm/migration.sql`: the extension.
5. `backend/dealership-api/src/persistence/migrations/drizzle/20261108125601_customer_list_indexes/migration.sql`.
6. `backend/dealership-api/src/business-logic/handlers/customers/get-list/__test__/get-customer-list.plans.test.ts`.
7. `backend/dealership-api/.oxlintrc.json`: the plan test may open a connection.
8. `docs/standards/multi-tenancy.md`: the search exception.
9. `FINAL.md`: ACME-110's row.

```ts
// ix_customers_list_by_name: (dealer_id, location_id, surname, first_name, id, status, city, last_contact_date)
// ix_customers_list_by_last_contact: (dealer_id, location_id, last_contact_date, id, status, city, surname, first_name)
// both WHERE is_deleted = false; ix_customers_search: GIN (customerSearchText) gin_trgm_ops, live rows
const { ids, total } = query.search
  ? await this.findSearchedAsync(dealerId, locationId, where, order, page, pageSize) // as the owner, scope written out
  : await this.findListedAsync(where, order, page, pageSize); // as the request
const items = await work.db
  .select()
  .from(customers)
  .where(inArray(customers.id, ids))
  .orderBy(...order); // as the request
```

**Impact:** Breaking changes: None (the API is the same) · Depends on: pg_trgm, which managed Postgres allows ·
Performance: 1.6 million customers at Northside; inserts keep three indexes up to date instead of two.

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                                        | Proves                                                     |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Handler (real Postgres) | `get-list/__test__/get-customer-list.plans.test.ts`         | each query's plan, as it ran, at 120,000 customers         |
| Handler (real Postgres) | `get-list/__test__/get-customer-list.query-handler.test.ts` | the same customers, the search, paging, row-level security |

## Steps

- [x] 1. Indexes and migrations → verify: the migration applies in the test database (the template is built from it)
- [x] 2. Name sorts by its columns; ids first, then rows → verify: the existing list tests pass
- [x] 3. The search's ids as the owner → verify: the plan test finds `ix_customers_search`; the list tests pass
- [ ] 4. Time it at 1.6 million → verify: `bun run sql:explain --as sam` per query, and `bun run load-test`

## Questions

None.

## Decisions

- D1 A search's ids and count are found as the owner with the dealer, location and live rows written out, the rows
  read as the request: under row-level security `ILIKE` (not leakproof) can never use the trigram index.
- D2 The exact total stays: to count most of the table Postgres reads it in parallel, which the timing step must show
  is quick enough; an estimated total would change what the list says.

## Log

- 2026-11-08 17:54 Plan started from the code: the default order had an index; a sort by Name ordered by the joined
  text (no index), later pages and the count read rows from the table, and the search (`ilike '%…%'` on five columns)
  could use no index.
- 2026-11-08 18:05 Built and checked: the plan test (6 queries' plans at 120,000 customers, each as it ran) passes; 94
  tests across customers, exports, handlers and persistence pass; the fast gate passes. Found on the way: the search
  could not use the trigram index under row-level security (D1), and an unawaited return let a unit of work close
  before its query ran, which the existing list tests caught.
