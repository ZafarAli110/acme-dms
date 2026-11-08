# ACME-120: Find a customer even when the name is misspelt

**Created:** 2026-11-08 22:41

**Status:** Done

**Ticket:** ACME-120 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Open: prototypes in `docs/prototypes/ACME-120/` → Picked: a.html (close spellings as rows in the same grid,
under a "Did you mean…" divider row, after the exact matches), by Zafar Ali, 2026-11-08

**Now:** Done: verified, evidence in `docs/evidence/ACME-120.md` · Next: Zafar Ali moves ACME-120 to in-review ·
Blocked: None

## Requirement

Sam types what he hears; "penwod" finds nobody. The customer search finds people whose name or company is spelt a
little differently from what was typed, and says when it is guessing.

- **In (the ticket's words):** a search with a letter missing, an extra letter or two letters swapped in a name or
  company still finds the customer; a correct spelling shows exactly the same list as today; when fewer than a page
  match exactly, the closest spellings fill the rest of the page under "Did you mean", closest first; email and phone
  are still found by any exact part, and a phone with one digit wrong does not find someone else; close spellings only
  from the person's location; a search answers within about a second at Northside; when nothing exact or close
  matches, the list says that no customers match.
- **Out:** a search of several words matched word by word (Zafar Ali, 8 Nov: its own ticket; a search with a space
  stays exact, as today); number plates (ACME-101); suggestions while typing; searches under three letters stay exact;
  an export holds only the exact matches (the ticket's open points).

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Search "penwod", "penwoood" and "pnewood" at Northside → no exact match; the note row 'No customers are called
      "penwod".', the divider, then Penwood customers first
- [x] Search a misspelt company word ("Haulge") → customers of "Penwood Haulage" among the close rows
- [x] Search a correct surname the location has ("Penwood"), with fewer than 25 or more → exactly today's list, no
      divider (a known name is a correct spelling, Zafar Ali, 8 Nov)
- [x] An unknown word with a few exact matches (a fragment such as "penwo" matching 3) → the 3, then the divider and
      close spellings to fill page 1; page 2 shows exact matches only
- [x] The divider reads "Did you mean… (closest spellings first)" across every column; the footer reads "3 exact
      matches · 22 close spellings" when close rows show (as a.html)
- [x] Search part of an email ("outlook") → found as today (exact)
- [x] At 200 a second with `--writes 5` → search p95 within a second; saves no slower than before (p95 in the Log)

Failure: invalid input, absent data, not allowed, another service down

- [x] Part of a phone number with one digit wrong → not found, and no close rows (the name list holds no digits)
- [x] maria at Riverside misspells a surname only Northside has → no Northside customer, exact or close
- [x] A search under three letters, or with a space → exact only, no divider
- [x] Nothing exact or close → "No customers match", no divider
- [x] A customer added, renamed, deleted or soft deleted → the name list follows in the same transaction

## Load before building

| Item                                                                                    | Kind     | Why                                            | Loaded? |
| --------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- | ------- |
| `docs/standards/database.md` "Audit columns", "Soft delete", "Migrations on big tables" | Standard | a technical table; the trigger; the backfill   | [x]     |
| `docs/standards/multi-tenancy.md` (location-scoped tables, the owner exception)         | Standard | the name list's policy; close customers' ids   | [x]     |
| `build-api-endpoint`                                                                    | Skill    | `match` on the list's items                    | [x]     |
| `docs/standards/web-architecture.md` "Text the user sees"                               | Standard | the note, divider and footer in both languages | [x]     |

## Shape

**Follows:** ACME-119's search path (ids as the owner through the trigram index, rows read as the request) ·
**Deviates:** a technical table kept by statement-level triggers (`customer_names`), the first in this service

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/persistence/schema/customer-names.ts` (**new**): `customer_names (dealer_id,
location_id, kind ('first' | 'surname' | 'company_word'), name, customers)`, unique `(location_id, kind,
lower(name))`, trigram GIN on `lower(name)`; a technical table (no audit columns, no soft delete: it is derived from
   `customers` and rebuilt from it)
2. `backend/dealership-api/src/persistence/migrations/drizzle/<timestamp>_customer_names/migration.sql` (**new**):
   `CREATE EXTENSION fuzzystrmatch`; the table and its location policy (as `customers`); statement-level triggers on
   `customers` with transition tables (`REFERENCING NEW/OLD TABLE`), so one statement of 1.6 million rows
   (`seed-bulk`) updates the counts in one aggregate; the backfill (`INSERT … SELECT … GROUP BY` from live customers;
   company words split on non-letters, three letters or more); `lock_timeout`. Saves wait while it runs (the trigger's
   lock): the backfill's time at 2.25 million rows goes in the Log; in production it runs in a quiet hour
3. `backend/dealership-api/src/business-logic/handlers/customers/get-list/close-names.ts` (**new**): read under the
   policy (a location has hundreds to a few thousand names: the policy narrows them first): whether the word is a
   known name, and its close names (`lower(name) % word` or `levenshtein ≤ 2`, ranked by levenshtein then similarity,
   up to 10)
4. `backend/dealership-api/src/business-logic/handlers/customers/get-list/get-customer-list.query-handler.ts`: on page
   1 of a one-word search of three letters or more that is not a known name and has fewer than `pageSize` exact
   matches: for each close name, its customers' ids by the same trigram search (`ILIKE '%name%'`, as the owner with the
   scope written out), minus the exact ones, in close-name order, up to the rest of the page; the rows read as the
   request and put back in that order; `match` on each item
5. `backend/dealership-api/src/dto/customers/customer-list-item.dto.ts`: `match: "exact" | "close"`
6. `web/app/pages/customers/types/customer.ts`: `match` on `CustomerListItem`
7. `web/app/pages/customers/columns/closeMatchRows.ts` (**new**): `withCloseMatchRows(items, search)`: the note row
   when there are no exact items, the divider before the first close item; the grid rows with their kind
8. `web/app/pages/customers/columns/customerColumns.tsx`: the note and divider rows span every column (`colSpan`)
9. `web/app/pages/customers/CustomerList.tsx`: the rows from `withCloseMatchRows`; the footer "N exact matches · M
   close spellings" when close rows show; the grid's `rowCount` at least the rows on page 1
10. `web/app/locales/en/customers.json`, `web/app/locales/fr/customers.json`: the note, the divider, the footer
11. `backend/dealership-api/src/business-logic/handlers/customers/get-list/__test__/get-customer-list.close.test.ts`
    (**new**): penwod, penwoood, pnewood; a company word; a known name unchanged; an email part; a fragment with a few
    exact; a phone one digit wrong; Riverside; under three letters; a space; nothing
12. `backend/dealership-api/src/persistence/unit-of-work/__test__/customer-names.test.ts` (**new**): insert, rename,
    delete, soft delete, a bulk insert of many rows: the counts follow
13. `backend/dealership-api/src/business-logic/handlers/customers/get-list/__test__/get-customer-list.plans.test.ts`:
    close names and close ids never read the whole table
14. `web/app/pages/customers/columns/__test__/closeMatchRows.test.ts` (**new**): the note, the divider before the
    first close row, none when all are exact
15. `docs/standards/database.md` (the technical tables), `docs/standards/multi-tenancy.md` (the name list under its
    policy), `docs/ARCHITECTURE.md` ("Handling load")

High-level code:

```ts
// close-names.ts (new), under the policy (location-scoped table)
select kind, name, levenshtein(lower(name), ${word}) as distance from customer_names
where lower(name) % ${word} or levenshtein(lower(name), ${word}) <= 2
order by distance, similarity(lower(name), ${word}) desc limit 10;
// get-customer-list: exact page as today; then, when the rules above allow it:
for (const close of closeNames) {            // closest first
  ids.push(...(await idsMatching(`%${close.name}%`, scoped, exclude, room)));  // owner, trigram index, scope
}
const rows = await readAsRequest(ids);        // row-level security decides
rows.sort(byIndexIn(ids));                    // the close order, not the name order
```

**Impact:** Breaking changes: none (`match` is new) · `seed-bulk` and `reset` fire the triggers (one aggregate per
statement: their times before and after in the Log) · Performance: close names in about a millisecond; close ids
through `ix_customers_search` (no new index on `customers`); every customer save also updates its names' counts
(checked with `--writes`)

## Tests

| Kind                    | File                                                       | Proves                                          |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| Handler (real Postgres) | `get-list/__test__/get-customer-list.close.test.ts`        | every box above but the screen and the load     |
| Persistence             | `persistence/unit-of-work/__test__/customer-names.test.ts` | the triggers keep the counts, a bulk insert too |
| Plans (real Postgres)   | `get-list/__test__/get-customer-list.plans.test.ts`        | no read of the whole table                      |
| Unit (web)              | `columns/__test__/closeMatchRows.test.ts`                  | the note, the divider, none when all exact      |
| Load                    | `load-test --rate 200 --writes 5`                          | search p95; saves' p95 against before           |

## Steps

- [x] 1. Tests first (handler, triggers, plans, web) → verify: they fail on today's code
- [x] 2. Migration and schema → verify: the trigger test; the backfill, `seed-bulk` and `reset` timed on the bulk data
- [x] 3. Close names and close customers; `match` → verify: handler and plans tests
- [x] 4. Web: rows, note, divider, footer, wording; beside a.html (`check-in-browser`) → verify: web tests;
      screenshots at 1440 and 1024 next to a.html, differences listed
- [x] 5. Measured: `sql:top --reset`, `load-test --rate 200 --writes 5` before and after → verify: search p95 within a
      second, saves' p95 no worse
- [x] 6. Docs and gates → verify: `bun run gate:fast`

## Questions

None open. Answered by Zafar Ali, 2026-11-08: the design (a.html); a name list per location kept on every save; a
known name is a correct spelling (today's list, no close rows); several words are not in this ticket.

## Decisions

- D1 Close names from a per-location name list (`customer_names`), over gathering distinct names from 1.6 million rows
  on each search (330 to 500 ms) — Zafar Ali's pick. A technical table, derived from `customers`.
- D2 Edit distance (levenshtein ≤ 2) with trigram similarity as candidates, over sound-alike codes: `dmetaphone` reads
  "Pnewood" as `NT` (a silent P) while Penwood is `PNT`.
- D3 A close name's customers by the existing trigram search with the corrected word, over equality on name columns:
  it reaches company words and emails as the search does, keeps phones exact (the list holds only letters), and needs
  no new index on `customers`.
- D4 Close rows only on page 1, filling it: later pages page the exact matches only.
- D5 Statement-level triggers with transition tables, over row triggers: `seed-bulk`'s 1.6-million-row insert updates
  the counts once, not 1.6 million times.

- D6 The footer reads "0 exact matches · 25 close spellings", over a.html's "0 exact matches · 1–25 of close spellings":
  the shorter wording says the same, with plurals ("1 exact match"); agreed by Zafar Ali, 8 Nov.
- D7 Only a word of letters (a name may have ' and -) gets close rows; a part of an email or a phone stays exact
  (Zafar Ali, 8 Nov, after the verifier found "aaron.penwood6@" filled with Penwoods).

## Log

- 2026-11-08 22:41 Measured on the bulk data (in a rolled-back transaction): `dmetaphone` Penwood `PNT`, Pnewood `NT`;
  levenshtein pnewood→Penwood 2, penwod 1, penwoood 1. Northside: 830 distinct surnames. Trigram candidates ranked by
  levenshtein: "pnewood" → Penwood first, "penwod" → Penwood, "yusf" → Yusuf; 330 to 500 ms each from 1.6 million rows.
- 2026-11-08 22:46 Architect: CHANGES, 10 findings. Two product questions answered by Zafar Ali (a known name keeps
  today's list; several words out). Fixed: a misspelt company, a correct spelling and an email part have boxes and
  tests; the picked design in full (note row, divider wording, footer, the grid's row count); close names read under
  the policy; close ids re-read as the request in their order; `customer_names` a technical table (database.md); no new
  index on `customers` (close ids through the trigram index); statement-level triggers, the backfill's lock timed,
  `seed-bulk`, `reset` and a `--writes` run measured; the web logic in a named, tested helper.
- 2026-11-08 22:53 Loaded: database.md (audit columns, soft delete, big tables), multi-tenancy.md, build-api-endpoint,
  web-architecture.md. Deviation: `match` goes on the page's items (`CustomerPageItemDto` in
  `customer-page-response.dto.ts`), not on `CustomerListItemDto`, which the recent list and the export share. In
  progress.
- 2026-11-08 23:08 Steps 1 to 6. Tests first: the trigger test (adds, rename, soft and hard delete, a 5,000-row insert), the close
  handler test (penwod, penwoood, pnewood, a company word, a known name, an email part, a phone one digit wrong,
  Riverside, under three letters, a space, nothing), the close-path plans test, the web helper's test: all failed
  before. Migration `20261108175502_customer_names` (fuzzystrmatch, table, policy, `customer_names_of`, one SECURITY
  DEFINER statement-trigger function with transition tables, triggers before the backfill). The existing sort-filter
  test caught close rows ignoring the list's filter: fixed (`listFilter` on close ids). dealership-api 257 tests, web
  67, typecheck; `gate:fast` 19 of 19.
- 2026-11-08 23:08 Measured by Claude on the bulk data: the backfill 3.5 s for 2.25 million customers (6,980 names), so saves wait
  about that long in the migration. API as sam: "penwod", "pnewood", "penwoood" → 25 close rows, Penwoods first;
  "ackroid" → Ackroyds; "Penwood" (a known name) → today's exact list; "421693" → nothing. Browser at 1440 and 1024: the
  note, the divider across the grid, the close rows like others; the footer first read "1–25 of 0 exact matches · 25
  close spellings" and the next arrow was on: fixed (`footerLabel`, `rowCount` counts customers only). Load at 200 a
  second with `--writes 5`, before → after: 0 failed both; search p95 96 → 107 ms (p99 136 → 327); adds p95 21 → 26 ms;
  edits 31 → 24 ms; close names 3.1 ms a call (3% of `sql:top`).
- 2026-11-08 23:08 Also, on Zafar Ali's word: explicit `null` over `undefined` where the API takes it (`.catch(() => null)` in
  migrate-database, the export queue, the consumer, upload-photo, apiClient; the factory; the filter; `body: null`).
- 2026-11-08 23:27 Verifier: FAIL on two rows, both fixed. (1) "hpoper" missed Grace Hopper: plain levenshtein counts a swap as 2,
  so Hopper tied with Harper, whose 8,998 customers filled the page. Now ranked by optimal string alignment (a swap is
  one edit) over 30 candidates, and each close name gives at most 10 customers. (2) "aaron.penwood6@" got 24 close
  rows: Zafar Ali chose letters only (D7). Also the footer's plural ("1 exact match", D6 agreed). Tests first (a swap
  beside 30 Harpers; an email fragment); list tests 32, web 67, `gate:fast` 19 of 19. Re-checked live by Claude:
  hpoper → Grace Hopper first; aaron.penwood6@ → 1 exact only; penwod 25 close; oppe 1 exact + 20 close, footer "1
  exact match · 20 close spellings". Evidence: [docs/evidence/ACME-120.md](../docs/evidence/ACME-120.md). Done.
