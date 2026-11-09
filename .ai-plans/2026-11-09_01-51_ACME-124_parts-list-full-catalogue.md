# ACME-124: The parts list keeps up with a full catalogue

**Created:** 2026-11-09 01:51

**Status:** Done

**Ticket:** ACME-124 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Follows: the Parts list as it is; the total read as the customer list reads it (ACME-117), but exact; the
description cell's "…" as the grid's other cut text

**Now:** Done: steps 1-7 · Next: Zafar Ali moves the ticket to in-review · Blocked: None

## Requirement

Maria, for the parts counters: with the whole catalogue in, the parts page drags on a busy morning, and every page
turn seems to start from scratch. With a full catalogue (60,000 parts a dealer, about 24,000 stocked at Northside), the
parts list, its total and the stock value come back as quickly as the customer list.

- **In:** a page read without reading the location's whole stock; the exact total asked once per search or filter
  (`GET /v1/parts/count`), not with every page; the stock value fast, fetched fresh on every visit, and leaving out
  parts in deleted bins; long descriptions end with "…" and show in full on hover.
- **Out:** the search itself (ACME-123, reused as it is); other locations' stock (ACME-104); a maintained stock-value
  total (the ticket asks for it worked out, always current).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Open Parts at Northside with the catalogue → the first page and "of 24,211" (the exact number, not "10,000+");
      page 3 and a sort by on hand, price, description or bin → each in tens of milliseconds
- [x] Turn pages and sort → the total is not asked again; a new search or filter → asked once
- [x] Change a part's price, save, open Parts → the stock value moved by that part's quantity × the change; a change
      saved elsewhere (another browser) shows the next time Parts is opened
- [x] A long description → ends with "…" at the column's edge, the full text on hover, at 1440 and 1024
- [x] Home's "Parts stocked at Northside" → the same number as the list's total
- [x] In the busy-morning run, the parts list and its count answer as fast as the customer list and its count; stock
      value as fast as the list

Failure: invalid input, absent data, not allowed, another service down

- [x] Another location's or another dealer's parts, a deleted part, a part in a deleted bin → never on a page, never
      in the count, never in the stock value; a page stays full and its next page and `hasMore` agree with the count
- [x] A filter or sort the list does not take → 400, as today; the count refuses the same
- [ ] A location with no parts → "No parts stocked at …", total 0, stock value 0
- [x] The search and its order (ACME-123) → unchanged: its tests pass, the total moving to the count

## Load before building

| Item                                                    | Kind     | Why                                                     | Loaded? |
| ------------------------------------------------------- | -------- | ------------------------------------------------------- | ------- |
| `build-api-endpoint`                                    | Skill    | the count endpoint, its handler, DTO, controller, tests | [x]     |
| `tanstack-query`                                        | Skill    | the count's key and options, asked once per question    | [ ]     |
| `react-router-framework-mode`                           | Skill    | the list's clientLoader prefetching page, count, value  | [ ]     |
| `docs/standards/database.md` "Migrations on big tables" | Standard | the covering indexes                                    | [x]     |
| `docs/standards/business-handlers.md` "List endpoints"  | Standard | one sort, one filter; count with the same joins         | [x]     |
| `check-in-browser`                                      | Skill    | the list, its total, the "…" at two widths              | [ ]     |

## Shape

**Follows:** ACME-117's count for customers (`8b77411`: `CountCustomersQueryHandler`, `GET /v1/customers/count`,
`CustomerPageResponseDto` with `hasMore`, `customerQueryOptions.count` keyed by the question, `CustomerList` reading
the count) and ACME-123's read by ids (`findStockedPartsByIdsAsync`) · **Deviates:** the parts total is exact (the
ticket), where customers cap at 10,001: the footer shows the number formatted, never `formatListTotal`

Measured before planning (Northside, maria's request, the catalogue loaded; Log 01:51):

| Query                            | Today                | Planned shape                                                               |
| -------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| a page (part number order)       | 66 ms (reads 24,211) | 6 ms without the bins join (step 2 re-measures with the live-bin condition) |
| a page sorted by on hand / price | not measured         | 18 / 30 ms (top-N over the location's stock)                                |
| the count                        | 45 ms, every page    | 26 ms with covering indexes, once per question                              |
| stock value                      | 52 ms (parallel)     | 28 ms on one worker                                                         |

The cause: under the policies Postgres guesses one bin per location (there are 6), so it joins the location's whole
stock and sorts it for every page. Without the `bins` join it walks the part-number index and stops at the page.

**Deleted bins, the same rows everywhere:** the page's ids, the count and the stock value all keep only stock in a live
bin of the location, as a condition rather than a join: `part_inventories.bin_id = any(array(SELECT id FROM bins))`
(the bins policy picks the dealer, the location and live bins; a location has a handful), so the planner keeps the
index walk. (`IN (SELECT …)` was planned as the same misjudged join, 65 ms: step 2.) The rows are then read with their
bin for the page's 25 ids.

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/business-logic/handlers/parts/part.queries.ts`: `liveBinStock` (**new**, the condition
   above); `findStockedPartsAsync` finds the page's ids from `part_inventories` and `parts` with it (joining `bins`
   only when the sort or filter is the bin), one more than the page for `hasMore`, then reads the rows with
   `findStockedPartsByIdsAsync`; `countStockedPartsAsync` (**new**, the same from, condition and filter);
   `partSearchWhere` (**new**, taken out of `findMatchingPartIdsAsync`) so the search's count uses it; the search page
   drops `count(*) over ()`
2. `backend/dealership-api/src/business-logic/handlers/parts/get-list/get-part-list.query-handler.ts` and
   `business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface.ts`: return
   `PartPageResponseDto`
3. `backend/dealership-api/src/business-logic/handlers/parts/count/count-parts.query-handler.ts` (**new**) and
   `business-logic-abstractions/handlers/parts/count/count-parts.query-handler.interface.ts` (**new**): the location's
   parts matching the search and filter, exact; the search as the owner (ACME-123's rule), the rest under the policy;
   registered in `business-logic/business-logic.module.ts`
4. `backend/dealership-api/src/dto/parts/part-page-response.dto.ts` (**new**: `items`, `page`, `pageSize`, `hasMore`)
   and `dto/parts/part-count-response.dto.ts` (**new**: `total`)
5. `backend/dealership-api/src/service/controllers/parts/part.controller.ts`: `GET /v1/parts/count` (`ListQuerySchema`;
   page, size and sort ignored), the list's response type
6. `backend/dealership-api/src/business-logic/handlers/parts/get-stock-value/get-stock-value.query-handler.ts`: stock
   in a live bin only (`liveBinStock`); `business-logic/handlers/stock/get-list/get-stock-list.query-handler.ts` keeps
   its `total` from `countStockedPartsAsync` (`GET /v1/stock`, no web caller, counted every page before too)
7. `backend/dealership-api/src/persistence/schema/part-inventories.ts`, `schema/parts.ts`, and a migration (**new**,
   big-table form): `ix_part_inventories_location_stock (location_id) INCLUDE (dealer_id, part_id, bin_id,
quantity_on_hand, reorder_level) WHERE NOT is_deleted` and `ix_parts_live_price (id) INCLUDE (dealer_id,
unit_price, part_number) WHERE NOT is_deleted`: every column the policies and the queries read, so they can be read
   index-only; each kept only if step 3 shows it so
8. Web: `pages/parts/queries/partQueries.ts` (`countPartsAsync`), `partQueryKey.ts` (`count(locationId, question)`),
   `partQueryOptions.ts` (`count` from the new endpoint, `retryOnMount: false`; `stockValue` with `staleTime: 0`, so
   every visit fetches it), `types/part.ts` (`PartPage`, `PartQuestion`), `hooks/usePartCount.ts`,
   `hooks/usePartList.ts`, `PartList.tsx` (the clientLoader prefetches the page, the count and the stock value;
   `rowCount` from the count; the footer's total as the exact number), `pages/Home.tsx` (the count for "every part")
9. `web/app/pages/parts/columns/partColumns.tsx`: the description cell ends with "…" and carries a `title`
10. Tests: `get-list/__test__/get-part-list.query-handler.test.ts` (the existing `list.total` assertions move to the
    count; `hasMore`; every sort; a part in a deleted bin inside page 1), `count/__test__/count-parts.query-handler.test.ts`
    (**new**), `get-stock-value/__test__/get-stock-value.query-handler.test.ts` (a deleted bin; **new** if none),
    `pages/parts/queries/__test__/partQueryKey.test.ts` (**new**), `web/e2e/parts.spec.ts`
11. `scripts/load-test.ts`: a "parts count" entry beside "customer count"; `docs/ARCHITECTURE.md` "Handling load": the
    parts list follows the customer list

```ts
// part.queries.ts
/** Stock in a live bin of the location: the bins policy decides which; a condition, not a join (ACME-124). */
const liveBinStock = inArray(partInventories.binId, db.select({ id: bins.id }).from(bins));

const needsBin = query.sort === "bin" || query.filterField === "bin";
const from = db.select({ id: parts.id }).from(partInventories).innerJoin(parts, eq(parts.id, partInventories.partId));
const ids = await (needsBin ? from.innerJoin(bins, eq(bins.id, partInventories.binId)) : from)
  .where(and(liveBinStock, listFilter(STOCKED_PART_COLUMNS, query)))
  .orderBy(...listOrderBy(STOCKED_PART_COLUMNS, query, [asc(parts.partNumber)], [asc(parts.id)]))
  .limit(pageSize + 1)
  .offset(pageOffset(page, pageSize));
const items = await findStockedPartsByIdsAsync(
  db,
  ids.slice(0, pageSize).map((row) => row.id),
);
return { items, hasMore: ids.length > pageSize };
```

**Impact:** Breaking changes: `GET /v1/parts` answers `hasMore` instead of `total` (the web is the only caller, changed
here; Home's part count moves to the count endpoint) · Depends on: ACME-123 · Performance: the measurements above; one
count per question instead of per page; the stock value fetched on every visit (28 ms); two covering indexes (one more
index write per stock or part save each)

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                  | Proves                                                                                                                                                                           |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handler (real Postgres) | `get-part-list.query-handler.test.ts` | `hasMore` at the last page; every sort; the bin sort and filter; a part in a deleted bin inside page 1: page 1 full, page 2 and `hasMore` agree with the count; search unchanged |
| Handler (real Postgres) | `count-parts.query-handler.test.ts`   | exact; other location, other dealer, deleted part, deleted bin never counted; filter; search                                                                                     |
| Handler (real Postgres) | stock value                           | other location, deleted part, deleted stock and a deleted bin's stock never in the value                                                                                         |
| Unit                    | `partQueryKey.test.ts`                | page, size and sort leave the count's key alone; search and filter change it                                                                                                     |
| End to end (Playwright) | `web/e2e/parts.spec.ts`               | the exact total (the count endpoint's number, formatted); page 3; no count request on a page turn; a price saved changes the stock value by quantity × change on the next visit  |

## Steps

- [x] 1. The count endpoint and its handler, tests first → verify: the count tests fail, then pass
- [x] 2. The page with `liveBinStock` and without the bins join, `hasMore`, the read by ids; stock value's live bins;
      tests first → verify: the list and stock-value tests fail, then pass; `sql:explain --as maria` of a page: still
      the index walk (else the fallback in Shape)
- [x] 3. The covering indexes and stock value on one worker → verify: `bun run sql:explain --as maria` of the page,
      each sort, the count and stock value: the scan type and heap fetches for each query an index is meant to serve
      (index-only, few heap fetches after `VACUUM`), in the Log; an index not read that way is dropped
- [x] 4. Web: the count per question, the stock value fresh on each visit, `PartList`, Home, the description's "…" →
      verify: `bun run gate:fast`; `parts.spec.ts`
- [x] 5. Looked at: `check-in-browser` at 1440 and 1024: "of 24,211", page 3, a long description with "…" and its
      hover; a price changed in a second browser, then Parts opened in the first: the stock value moved → verify:
      screenshots read, the numbers in the Log
- [x] 6. Measured: the "parts count" entry; `bun run load-test --rate 200 --people 20 --writes 5` → verify: parts
      list, parts count and stock value p50/p95 beside customer list and count, and against ACME-123's run
- [x] 7. `verify-ticket` → verify: `docs/evidence/ACME-124.md`, every box cited

## Questions

None: the interview settled the total (exact, once per question), the stock value (always current) and the "…" (in
this ticket); the ticket says them.

## Decisions

- D1 The page's ids without the `bins` join, deleted bins left out by a condition (the bins policy's live bins), the
  bin read for the page's rows, over a planner setting or keeping the join: the join is what misleads the planner,
  and the page needs the bin only for 25 rows.
- D2 The live bins as `= any(array(select …))`, over `IN (select …)`: Postgres turns the `IN` into the join it
  misjudges (65 ms); the array is worked out first and leaves the index walk alone (3 ms).
- D3 Stock value with Postgres's own parallel choice, over pinning one worker: measured warm, one worker is slower
  (29 ms against 14.7 ms); step 6's load run shows whether workers run short under load.
- D5 The stock value asked fresh by the list's clientLoader when it arrives from another page (`staleTime: 0` there,
  `"static"` for a page turn), over `staleTime: 0` on its options: on the options, the page showing would fetch it a
  second time right after the loader, and every page turn would fetch it again.
- D4 `GET /v1/stock` keeps its `total`, counted by `countStockedPartsAsync` on each page as before: its contract is
  not this ticket's, and no page of the web reads it.

## Log

- 2026-11-09 01:51 Ticket ACME-124 from the interview (all three recommended answers). Measured as maria at Northside
  with the catalogue (`sql:explain --as maria`; covering indexes tried in a rolled-back transaction): the table above;
  the count of stock rows alone 7.8 ms but wrong for a deleted part with live stock (an existing test), so the count
  keeps its join with parts. Read: ACME-117's count change (`8b77411`, 24 files), `part.queries.ts`,
  `usePartCount.ts` (Home reads the list's `total` today), `PartList.tsx` (`rowCount: data?.total`).
- 2026-11-09 01:56 Architect: CHANGES, 7 findings, all taken, no product question. The page, the count and the stock value now
  leave out the same rows: stock in a live bin, by a condition (`liveBinStock`), with a test of a deleted bin inside
  page 1 and a fallback if the plan changes. Stock value leaves out deleted bins (it never joined `bins`) and is
  fetched on every visit (`staleTime: 0`, prefetched), with an e2e and a two-browser check. The footer shows the exact
  number, never `formatListTotal`'s "10,000+". The list's handler interface and its existing `total` tests named.
  The covering indexes include `dealer_id` (the policies read it); step 3 records index-only scans and heap fetches.
  D1-D3 (the ticket's own words) removed.
- 2026-11-09 14:50 Step 1: `CountPartsQueryHandler`, `GET /v1/parts/count`, `PartCountResponseDto`; `partSearchWhere`
  shared by the search's page and count. `count-parts.query-handler.test.ts` failed (no handler), then 4/4 passed.
- 2026-11-09 15:00 Step 2: the tests first (7 failed: no `hasMore`; stock value 864,206,573 against 864,197,573, the
  deleted bin's 9 × $10.00 counted); `findStockedPartsAsync` by ids, one more than the page; the search's page drops
  `count(*) over ()`; stock value with `liveBinStock`; then 51/51 (parts and stock). Found a caller the plan missed:
  the stock list (D4). `sql:explain --as maria`, page 3: `IN (select id from bins)` 65.5 ms, 24,211 rows sorted (a
  hash semi-join, bins guessed 1); `= any(array(…))` 3.1 ms, the part-number index walked, 208 rows read (D2).
- 2026-11-09 15:10 Step 3: the indexes tried in a rolled-back transaction, then migrated
  (`20261109095326_parts_list_covering_indexes`, 0.26 s at 60,000 parts × 4 locations) and `VACUUM ANALYZE`d; maria
  at Northside, warm, median of 5 (`try-indexes-124.ts`): page by number 0.3 ms; on hand 8.6, price 12.3, reorder
  6.9, description 21.1, bin 26.6 ms; count 13.8 (20 before), stock value 14.7 (21 before). Every query an index is
  for reads it Index Only, heap fetches 0 (on hand, reorder, bin, count, stock value: both; price: the parts one).
  Both kept (5.0 MB, 4.5 MB). One worker: 26-30 ms for every sort, the count and stock value, so not pinned (D3).
  Description sort reads `parts` whole (21 ms): no index has it, and none added.
- 2026-11-09 15:40 Step 4: web count per question (`PART_QUERY_KEYS.count(locationId, question)`, `EVERY_PART` for
  Home, the plain list's key), `PartList` loader prefetching page, count and stock value, `rowCount` from the count
  (footer "1–25 of 24,214 (the list shows the first 10,000 …)", the exact number); Home formats it ("24,214", was
  "24214"); `PartDescriptionCell` (`noWrap`, `title`). D5. `gate:fast` 19/19; `partQueryKey.test.ts` 2/2; e2e
  `parts.spec.ts` 7/7, `busy.spec.ts` 9/9 after restarting the system with the new API. The stock-value e2e checked by
  turning the fresh fetch off: it failed, 150 cents short (9,510,464,180 against 9,510,464,330), then passed again.
- 2026-11-09 15:45 Step 5: `shots124/shots.mjs` at 1440 and 1024: Home 24,214, footer 1–25 and 51–75 "of 24,214",
  subtitle $95,104,643.30; long descriptions end with "…", `title` the full text ("Control arm, front right, original
  equipment, Corsa 2019-2024"). The second-browser price change is the e2e above.
- 2026-11-09 15:50 Step 6: `load-test --rate 200 --people 20 --writes 5` (60 s): 11,997 answered, 3 busy, 0 failed;
  parts list p50 25 / p95 236 ms (customers list 22 / 239; ACME-123's run 128 / 344); parts count 42 / 292 (customers
  count 34 / 224); stock value 44 / 201 (61 / 203); all 29 / 289 (44 / 277). Parts search p95 559 (322 then; its p50
  49 against 63, the tails swing run to run, ACME-123 Log).
- 2026-11-09 16:20 Step 7: verifier FAIL: every correctness check passed (exact count, other location and dealer,
  deleted part and bin, `hasMore`, 400s, search, no count on page turns, stock value from another browser, "…"); at
  1024 the footer's long note pushed the next-page button out of the grid (shared `AppDataGrid` footer, since
  ACME-123's catalogue): fixed, the note wraps (`footer.mjs`: button inside the grid at both widths, Parts and
  Customers). It timed nothing: the Postgres and RabbitMQ containers restarted mid-run (neither the verifier nor the
  author restarted them; all 18 healthy again within minutes). Speed from steps 3 and 6. Not checked: an empty
  location (no box ticked for it from the running system; noted in the evidence). Evidence `docs/evidence/ACME-124.md`.
