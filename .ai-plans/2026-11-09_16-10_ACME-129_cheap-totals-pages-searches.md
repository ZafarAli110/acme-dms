# ACME-129: The busy morning on one ordinary database: cheap totals, pages and searches

**Created:** 2026-11-09 16:10

**Status:** In progress

**Ticket:** ACME-129 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Open: prototypes in `docs/prototypes/ACME-129/` → Picked: a.html, by Zafar Ali, 2026-11-09

**Now:** Done: steps 1–5 (planning measured; ties follow the sort; recent from the index; the migration; keyset and
totals for customers; phone search; parts; the stock value; the web, looked at and e2e 42 of 42; the load test pages
by cursor) · Next: Zafar Ali decides: commit this, then cheaper searches (now 80% of the database's work) before the
last measurement · Blocked: None

## Requirement

Maria: "I need to know if a search found 3 people or thousands, not whether Northside has 959,987 or 960,112
customers." Every page asks the database for a small fraction of today's work, so ACME-117's busy morning (3,300 a
second) fits one ordinary database server.

- **In:** "about", exact or "of many" totals; keyset paging for previous, next, first and last, offset
  for a jump by number; the page box; phone by start or end; an index for every sort; the stock value at most 10 s
  old; the export dialog's wording.
- **Out:** read replicas and sharding; name, company and email search (as today); what the export exports (as today).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [ ] Open Customers as `sam` at Northside → "1–25 of about 1,600,000", within 5% of the real count (SQL); Riverside
      and Westgate the same; `tom` at Central (City Motors, 1,095 customers) → the exact number
- [ ] Filter by status active → "of about" a number within 5% of the real one
- [ ] Search a surname with fewer than 25 matches → the exact number; a phone's last digits with hundreds of matches →
      "1–25 of many", and next goes on to the last match
- [ ] Filter city equals Hillcrest (7) → "1–7 of 7"; email is empty, and last contact after a date → exact or "of many"
- [ ] Search a company and an email → found as today
- [ ] Next, next, previous at Northside → the same rows as offset paging, each as quick as page 1, for every sort
      (name, company, email, phone, city, status, last contact), both directions
- [ ] Last page at Northside → "Last 25 of about 960,000", the box empty, the last customers by name; previous from it
      → "Rows before the last 25"
- [ ] Type 300 in the page box and press Enter → rows 7,476–7,500; a link with `?page=300` opens it too
- [ ] The footer as prototype A: rows per page, the range and total, first, previous, "Page" with its box, next, last;
      first and previous greyed on page 1, next and last greyed on the last page
- [ ] Sort by last contact, newest first → the same customers as today; equal dates in id order, newest id first
- [ ] Recent customers at Northside → under 5 ms in SQL (80 ms today)
- [ ] Search the last four digits of a phone, its first digits with a space, and "+44 113…" → the customer is found
- [ ] The phone column's filter offers starts with, ends with and equals, on digits; contains is gone
- [ ] Parts as `maria` at Riverside → totals, keyset paging and the page box as customers; a parts search pages by
      number as today
- [ ] Change a part's stock → the part shows it at once; the location's value within 10 s, to the cent
- [ ] The export dialog → "Export about 960,000 customers at Northside?", "Export all customers that match, at
      Northside?" for many, the exact number when exact; the file holds every match, as today
- [ ] Load test at 200 and 400 a second → Postgres CPU per answered request at most a fifth of the baseline, and p95
      within 300 ms (the Log)

Failure: invalid input, absent data, not allowed, another service down

- [ ] Type a page past row 10,000 in the box → it says the deepest page it can reach; the list stays where it was
- [ ] A cursor that is tampered with, from another sort, question or location → 400, never another location's rows
- [ ] A phone search with digits from the middle only → no match; the name search still works
- [ ] `tom` at Central (City Motors) → no total, estimate, page or stock value includes Northwind's data
- [ ] A customer added → in the list at once; only the "about" total may lag (statistics)

## Load before building

| Item                                                            | Kind     | Why                                          | Loaded? |
| --------------------------------------------------------------- | -------- | -------------------------------------------- | ------- |
| `docs/standards/database.md` "Migrations on big tables"         | Standard | the indexes and the phone index's build      | [x]     |
| `docs/standards/multi-tenancy.md` "Location" (rules 1–4)        | Standard | the owner path, the cache's key, estimates   | [x]     |
| `docs/standards/web-architecture.md` "Server data: four layers" | Standard | the grid, its footer, the URL's list params  | [x]     |
| `docs/standards/money.md` "Rules" (2, 7)                        | Standard | the stock value stays exact to the cent      | [x]     |
| `tanstack-query`                                                | Skill    | the page and total queries, cursors in cache | [x]     |
| `check-in-browser`                                              | Skill    | the footer at 1440 and 1024, against A       | [x]     |

## Shape

**Follows:** ACME-119's list (ids first, rows as the request), ACME-124's parts list, `AppDataGrid`'s footer ·
**Deviates:** keyset cursors (a new list shape); a 10 s in-process cache (the first cache in the service)

Files (each checked to exist, or marked **new**). `B` is `backend/dealership-api/src`:

1. `B/persistence/unit-of-work/unit-of-work.ts`: unchanged (step 1: planning is 2% of the work, D8)
2. `B/business-logic/list-query/list-columns.ts`: the id follows the sort's direction; each direction keeps today's
   nulls (asc nulls last, desc nulls first, Postgres's default)
3. `B/business-logic/list-query/keyset.ts` (**new**): `Cursor` (the last row's sort values and id, the question's hash,
   dealer and location, HMAC-signed with the export link key's pattern) and `afterCursor(order, cursor)`: one row
   comparison when no sort value is null, a null branch otherwise
4. `B/business-logic/list-query/page-offset.ts`: offset kept for a jump by number and for a parts search
5. `B/business-logic/list-query/estimate.ts` (**new**): `estimateRowsAsync(db, query)`, the planner's rows from
   `EXPLAIN (FORMAT JSON)`, as the request
6. `B/dto/paging/list-query.dto.ts`: `after`, `before`, `last`; `B/dto/customers/customer-page-response.dto.ts`,
   `B/dto/parts/part-page-response.dto.ts`: `next` and `previous` cursors; `customer-count-response.dto.ts`,
   `part-count-response.dto.ts`: `{ kind: "exact" | "about" | "many", value }`
7. `B/business-logic/handlers/customers/get-list/get-customer-list.query-handler.ts`: keyset pages; a search decides
   its path from the estimate instead of a count (code below)
8. `B/business-logic/handlers/customers/count/count-customers.query-handler.ts`: about (no search, no filter, or a
   status filter) when the estimate is over 10,000, counted when under (D9); else exact up to 100 matches, else many
9. `B/persistence/schema/customers.ts` and a migration: indexes for the sorts that have none (company, email, phone,
   city, status: dealer, location, the column, id, `is_deleted = false`); the phone's digits as two expression
   indexes (digits, and reversed, `text_pattern_ops`, same prefix and partial); `customerSearchText` without the
   phone, its trigram index built anew beside the old; `CREATE STATISTICS` (dependencies) on dealer, location, status
10. `B/business-logic/handlers/customers/get-recent/get-recent-customers.query-handler.ts`: the index's order (ties by
    id, newest first)
11. `B/business-logic/handlers/parts/part.queries.ts`, `B/business-logic/handlers/parts/count/count-parts.query-handler.ts`:
    keyset for the list, offset for a search (its best-match order mixes directions and a float: D4), totals
12. `B/business-logic/handlers/parts/get-stock-value/get-stock-value.query-handler.ts`, `B/business-logic/cache/ttl-cache.ts`
    (**new**): keyed by dealer and location, 10 s, one sum in flight per key
13. `web/app/core/hooks/useListParams.ts`: `after`, `before`, `last` beside `page`
14. `web/app/components/data-grid/AppDataGrid.tsx`, `web/app/components/data-grid/ListFooter.tsx` (**new**): footer A
15. `web/app/pages/customers/CustomerList.tsx`, `queries/customerQueryOptions.ts`, `web/app/pages/parts/PartList.tsx`,
    `queries/partQueryOptions.ts`, `web/app/core/formatters/formatNumber.ts`: the three totals, the export dialog
16. `web/app/locales/{en,fr}/customers.json`, `common.json`: "of about", "of many", "Last 25", the box, the dialog
17. `scripts/load-test.ts`: pages by cursor as the web will (next from page 1, a jump now and then, the last page)

```ts
// get-customer-list.query-handler.ts: a search's path, from the estimate (planning only), not a count
if (searching && (await estimateRowsAsync(db, select(where))) <= MAX_LIST_DEPTH) {
  // few matches ("ahed": 6.5 s walking the name index): through the trigram index, then sorted
  await db.execute(sql`set local enable_indexscan = off`); /* … indexonlyscan off, force_custom_plan */
}
const rows =
  query.after || query.before || query.last
    ? await keysetPageAsync(db, where, order, query, pageSize + 1) // before / last: reversed order, rows put back
    : await offsetPageAsync(db, where, order, query.page ?? 1, pageSize + 1); // a jump: up to row 10,000

// count-customers.query-handler.ts
if (!query.search && (!query.filterField || query.filterField === "status")) {
  return { kind: "about", value: await estimateRowsAsync(work.db, select(where)) };
}
const first = await this._list.firstPageIdsAsync(userContext, query); // as the list finds page 1
return first.hasMore ? { kind: "many", value: null } : { kind: "exact", value: first.ids.length };

// phone: digits typed (spaces, dashes, brackets and + ignored), and nothing else; both arms from an index
sql`${digitsOf(customers.phone)} like ${`${digits}%`} or reverse(${digitsOf(customers.phone)}) like ${`${reversed}%`}`;
```

**Impact:** Breaking changes: the count endpoints' answer (`{ total }` → `{ kind, value }`) and the page answers'
cursors; the web and the load test are the callers, both changed · Depends on: a migration with seven indexes over 1.6
million rows: `lock_timeout 5s`, each `CREATE INDEX IF NOT EXISTS` (built `CONCURRENTLY` first in production), the old
trigram index dropped in a later release; timed after `seed:bulk` · Performance: baseline 9 Nov 16:00,
`start:prod --load-test`, 4 copies: 200/s all answered, p95 97 ms, Postgres 408% (about 20 ms of CPU a request);
400/s 108 answered a second, Postgres 670%

## Tests

| Kind                    | File                                                                                               | Proves                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Handler (real Postgres) | `B/business-logic/handlers/customers/get-list/__test__/get-customer-list.keyset.test.ts` (**new**) | keyset = offset, forwards and backwards, every sort both ways; a cursor changed, from another sort or location: 400 |
| Handler (real Postgres) | `.../get-list/__test__/get-customer-list.query-handler.test.ts`                                    | phone by start, end, "+"; middle not; company and email as today                                                    |
| Handler (real Postgres) | `.../get-list/__test__/get-customer-list.plans.test.ts`                                            | every sort, recent and the phone from an index, no sort node                                                        |
| Handler (real Postgres) | `B/business-logic/handlers/customers/count/__test__/count-customers.query-handler.test.ts`         | about, exact, many; never another location's rows                                                                   |
| Handler (real Postgres) | `B/business-logic/handlers/parts/count/__test__/count-parts.query-handler.test.ts`                 | the same for parts                                                                                                  |
| Handler (real Postgres) | `B/business-logic/handlers/parts/get-stock-value/__test__/get-stock-value.query-handler.test.ts`   | 10 s, to the cent, one sum per dealer and location                                                                  |
| End to end (Playwright) | `web/e2e/customers.spec.ts`, `web/e2e/parts.spec.ts`                                               | footer A, the box, the totals, the phone search, the dialog                                                         |

## Steps

- [x] 1. Spike: how much planning costs → verify: planning time tracked (`pg_stat_statements.track_planning`, turned
      off again in step 12), load at 200/s
- [x] 2. The id follows the sort, nulls as today, recent from the index → verify: plans test, recent under 5 ms
- [x] 3. The migration: sort indexes, phone indexes, search index, statistics → verify: timed after `seed:bulk`, plans
      test for every sort
- [x] 4. Keyset for customers (API, DTO) → verify: keyset test = offset, every sort; tampered cursor 400
- [x] 5. Totals for customers; a search's path from a count on its first page only → verify: count tests; "ahed" and
      "son" at Northside each under 50 ms; estimates within 5% at Northside, Riverside, Westgate; Central exact
- [x] 6. Phone by start or end; the column filter → verify: handler tests, explain under 1 ms
- [x] 7. Parts: keyset and totals; search by number → verify: parts tests
- [x] 8. Stock value cache → verify: its test; a stock change shows within 10 s
- [x] 9. Prototypes of the footer; Zafar Ali picks → verify: Design says Picked
- [ ] 10. The web: URL params, footer A, totals, the dialog, locales → verify: e2e; check-in-browser at 1440 and 1024
      next to a.html, region by region
- [x] 11. Load test pages by cursor → verify: its own test
- [ ] 12. Measure 200, 400, 800 a second, `sql:top` → verify: CPU per request at most a fifth of the baseline, p95
- [ ] 13. `verify-ticket` → `docs/evidence/ACME-129.md`

## Questions

None

## Decisions

- D1 Ties follow the sort's direction, over id always ascending: one index per sort serves both directions and keyset
  needs one comparison (Zafar Ali, 9 Nov).
- D2 A date filter's total is exact or "of many", never "about": the ticket's "never a number that could be far off"
  (default taken by Claude, 9 Nov; if wrong, a last-contact filter shows "of many" where an estimate would do).
- D3 The stock value is kept in each copy's memory, over a shared cache: 4 copies sum a location at most 4 times in
  10 s, and nothing new to run (Claude).
- D4 A parts search pages by number (offset, up to row 10,000), not keyset: its best-match order mixes directions and a
  float rank; a search's pages are few (Claude).
- D5 The phone is searched through expression indexes on its digits, over a generated column: no table rewrite under a
  lock (database.md, "Migrations on big tables") (Claude).
- D6 The footer: a page box between first, previous, next and last (prototype A), over numbered buttons (Zafar Ali,
  9 Nov); past a known row number: "Last 25" and an empty box (Zafar Ali, 9 Nov).
- D8 No plan reuse (named statements): planning is 2% of the database's time under load (2.4 s of 118 s at 200/s);
  the 0.8–1.3 ms of a single `EXPLAIN` was a fresh connection loading its catalogue (Claude, measured).
- D9 The whole list's total is exact when Postgres expects 10,000 or fewer (counted, a few ms), "about" only above:
  statistics sample the whole table, so a small location's estimate is rough (Central 829 against 1,095) (Claude,
  measured; never less accurate than the ticket asks).
- D10 A search's first page counts its matches up to 10,001 to choose its path, and its cursors carry the choice, over
  the estimate: Postgres expected 12,845 for "ahed" (none) and 2,569 for "gmail" (222,815), and the wrong path costs
  3 to 6 s (Claude, measured). Before, every page of a search counted.
- D11 Text of a phone's characters only (digits, spaces, dashes, dots, brackets, "+") is a phone search; anything with
  a letter or an @ searches names, companies and emails. So "4417" no longer finds an email "j.4417@…" ("j.4417@"
  does); a typed "+44 113" does not find a number stored as "0113" (Claude, default: the ticket names neither).
- D12 The parts sorts other than part number (description, bin, quantity, reorder level, price) get no new indexes:
  each sorts the location's stock (24,221 at Northside) as today, start and end alike, and none is in the busy-morning
  mix; the part-number order and the last page are keyset from its index (Claude).
- D7 One ticket, not three: the product owner asked for one result (a fifth of the work), and phone search and the
  cache each touch the totals' and the list's files; each step is its own commit (Claude).

## Log

- 2026-11-09 16:10 Plan from the interview and the baseline: 200/s all answered, p95 97 ms, Postgres 408%; 400/s 108
  answered a second, Postgres 670%. `sql:top` at 200/s: list ids 24%, counts 28%, searches 23%, recent 6% (80 ms: an
  incremental sort of 149,452 rows), stock value 6%, parts list 6%. Planning 0.8–1.3 ms against 0.14 ms run.
- 2026-11-09 16:12 Prototypes a.html (page box) and b.html (numbered buttons); Zafar Ali picked A and said go once the
  architect round is done.
- 2026-11-09 16:17 Architect: CHANGES, 17 findings. Fixed: ties and the export dialog, the phone filter and "+", deep
  pages' footer (Zafar Ali's answers: D1, D6, the acceptance rows); date filter (D2, a default); text-filter totals
  include isEmpty; parts search by number (D4); nulls as today; an index per sort; the search path from the estimate;
  extended statistics; named statements on `pg`, no driver change; big-table migration rules; cache keyed by dealer
  and location; the real DTO files; boxes for p95, company and email; full test paths; why one ticket (D7).
- 2026-11-09 16:20 Step 1: `track_planning` on (ALTER SYSTEM, reload), `sql:top --reset`, 200/s for 30 s: all 6,000 answered, p95
  103 ms, Postgres 407%; planning 2,425 ms against 115,584 ms running, 61,229 statements (about 7.6 a request).
  Planning is 2%: no plan reuse (D8). The ticket's "a fifth" now rests on the statements' own time.
- 2026-11-09 16:23 Step 2: `listOrderBy` takes the tie-breakers as columns and gives them the sort's direction; recent customers by
  last contact then id, both newest first. Plans test: `expectNoSort` added to name and last contact (both ways) and a
  recent test; 3 fail on the old code, 14 of 14 pass on the new. Northside (`sql:explain --as sam`): recent 0.3 ms,
  newest-first page 0.1 ms, no sort node (80 ms before). Business-logic tests 158 of 158, fmt and oxlint clean.
- 2026-11-09 16:26 Step 3: migration `20261109112427_customer_sort_phone_indexes` (generated, then by hand: the header, `lock_timeout`,
  `IF NOT EXISTS`, `CREATE STATISTICS st_customers_scope`, `ANALYZE`); `ix_customers_search` kept until the next
  release. Applied to the running system (`db:migrate`, Northside 1.6 million): 31 s. Plans test: every other sort,
  both ways, from `ix_customers_sort_*` with no sort node; search tests now name `ix_customers_search_text`. 159 of 159. Estimates at Northside: all 1,605,651 against 1,605,608; active 953,203 against 959,987 (within 1%).
- 2026-11-09 16:35 Step 4: `keyset.ts` (sort spec, segments: a nullable key reads its filled run then its empty run, each ordered by
  the column and the id so the index serves it; `CursorCodec`, HMAC with EXPORT_LINK_KEY over the dealer, location,
  search, sort and filter); `after`, `before`, `last` in the list query (`last` a picklist: the OpenAPI converter has no
  `literal`); the page answers `next`, `previous`, and `page: null` for a cursor's page; `listPageTooDeep` now says Next
  and Last go further; `listCursorInvalid` (en, fr). `get-customer-list.keyset.test.ts`: 8 orders × 2 directions,
  forwards and backwards = paging by number; tampered, foreign-sort and foreign-location cursors 400. Plans test: a
  keyset page and the last page, default and email, both ways, from the index with no sort (the empty run sorted until
  ordered by the column too). 225 of 225 (business logic and service). Northside: last page by name 0.15 ms, after a
  cursor 0.25 ms, empty emails 0.06 ms, a city range 0.13 ms (offset at row 10,000: about 7 ms).
- 2026-11-09 16:42 Step 5: `ListTotalDto` (`exact` | `about` | `many`), `estimate.ts` (`EXPLAIN (FORMAT JSON)` in the request's
  transaction). Estimates against counts: Northside 1,605,651 / 1,605,608, Riverside 399,397 / 402,549, Westgate
  254,860 / 251,604, Central 829 / 1,095 (24% off: small, so counted, D9). A search's path from its estimate failed:
  "ahed" 12,845 expected, 0 there, walked the name index 3–6 s; "gmail" 2,569 / 222,815, sorted 280 ms. So a capped
  count on the first page decides, carried in the cursor (D10): "ahed" 0.1 ms, "smith" 4 ms, "son" 15 ms, "gmail"
  36 ms, then 0.1–3 ms a page. Count endpoint for a search: up to 101, 0.1–28 ms. Tests: count tests rewritten (exact
  while few, about within 5% at 30,000, many past 100); plans test: Northside's estimate within 5% of 118,403; the
  search's page and count through `ix_customers_search_text`. 226 of 226.
- 2026-11-09 16:44 Step 6: phone search by the start or end of its digits (`phoneDigitsTyped`, `phoneMatching`); the phone column a
  `phone` filter type (starts with, ends with, equals, empty; contains refused, a 400 for no digits, `notAPhone` en,
  fr). Tests: start, end, brackets and dashes, "+44 7700", "496" (middle) finds none, company and email as before;
  the column's filters; plans: page and count through `ix_customers_phone_end` / `_start`. 228 of 228, plans 17 of 17. Northside: "4417" 101 matches 0.2 ms, "829" 1,195 matches 1.6 ms, a whole number 0.02 ms (before: `%4417%`
  through the trigram index, about 340 ms).
- 2026-11-09 16:48 Step 7: parts keyset (`findStockedPartsAsync` with a move and a cursor, `partSortSpec`), the page answers
  `next`/`previous` (null for a search, which pages by number and refuses a cursor); totals as customers: the whole
  list "about" from the inventory estimate when over 10,000 (Northside 24,266 / 24,223; with the live-bins array
  Postgres guessed 14,101), counted when small, a search or filter exact up to 100 else many; `/v1/stock` keeps its
  exact total. `get-part-list.keyset.test.ts`: 7 sorts × 2 ways forwards and backwards = by number; a search's
  cursor 400. 231 of 231. Northside: last page 0.4 ms, after a cursor 0.7 ms (offset at row 10,000: 77–109 ms); the
  exact count was 27–31 ms a question.
- 2026-11-09 16:50 Step 8: `cache/ttl-cache.ts` (per key, one read in flight, a failed read not kept, the oldest key out past
  10,000); the stock value through it by dealer and location, 10 s (`STOCK_VALUE_TTL_MS`), the handler a singleton
  (no request-scoped providers). Tests: two callers at once sum once; a stock change shows only after 10 s; another
  location its own value; a failed sum not kept. Whole backend: typecheck, lint clean, 294 of 294.
- 2026-11-09 16:55 Step 10, code: `ListCursor` in the URL (`after`, `before`, `last`; the page's number kept when known, null after
  Last); `update` drops a cursor unless the change sets one; `toListApiQuery` sends a cursor without the page;
  `ListFooter` (design A: rows per page, the range and total, first, previous, Page box, next, last; "Last 25", "Rows
  before the last 25", a jump past page 400 or past the end says so); the grid's own footer hidden for server lists;
  `ListTotal` and `formatListTotal` (about to two figures: 1,605,651 → "about 1,600,000"); Home's tiles; the export
  dialog's three wordings; the phone column's filter (starts with, ends with, equals, empty); en and fr. Web: typecheck,
  lint, 83 of 83 unit tests. Not yet looked at in a browser or run end to end: needs the system restarted on this code.
- 2026-11-09 17:06 Restarted `start:prod --load-test` (4 copies) on Zafar Ali's word, after `bun run build` in dealership-api
  (`start:prod` runs the bundle as built: it was 15:17's). All 18 healthy. Browser, sam at Northside, 1440 and 1024:
  footer as a.html ("Rows per page 25", "1–25 of about 1,600,000", first and previous greyed, Page [1], next, last),
  nothing cut off at 1024; Last: "Last 25 of about 1,600,000", box empty, next and last greyed; a search "1–25 of
  many"; 9999 in the box: red, "Up to page 400: go further with Next or Last."; Parts "1–25 of about 24,000". The
  page box's Enter did nothing at first (`onKeyDown` on the TextField reached its outer element): moved to the input.
  e2e: customers and parts specs rewritten for the footer, the export dialog, the stock value within 10 s; the whole
  suite 42 of 42. French footer not yet seen in a browser.
- 2026-11-09 17:06 Step 11: the load test asks for customer pages as the web does (45% page 1, 35% after a cursor, 8% before, 7%
  last, 5% a jump by number), cursors collected from page 1, the middle, the last reachable page and the last page;
  reads the count's `kind`/`value`. Scripts' tests 14 of 14.
- 2026-11-09 17:06 Measured (`sql:top --reset`, then 200/s and 400/s for 30 s): 200/s all answered, p95 72 ms (103), Postgres 259%
  (407): about 13 ms of CPU a request (20). 400/s: 373 answered a second (108), 818 told busy, p95 1.6 s, Postgres 563%:
  about 15 ms a request (62). A third less work a request, not the fifth asked. `sql:top`: lists and totals are gone
  from the top; searches are about 80%: a search's first-page count to 10,001 (31%, 30 ms, 3,038 calls), its page (21%,
  21 ms), close spellings' customers by a substring per close name (12% at 88 ms and 8% at 47 ms), a dense search's
  walk (10%, 42 ms), the parts search (9%, 27 ms). Planning 10.7 s of 313 s (3%). `track_planning` still on.
