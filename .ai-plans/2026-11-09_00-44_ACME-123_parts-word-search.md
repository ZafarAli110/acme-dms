# ACME-123: Find a part by the words people use

**Created:** 2026-11-09 00:44

**Status:** Done

**Ticket:** ACME-123 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Backend

**Design:** Follows: the Parts list as it is (its search box, its "No parts match" text); no screen changes

**Now:** Done: verified, evidence in `docs/evidence/ACME-123.md` · Next: commit on Zafar Ali's word; D5 (a follow-up ticket) to him · Blocked: None

## Requirement

Maria, for the parts counters: a customer says "front brake pads" and the counter types "brake pads", but the catalogue
says "Brake pad set, front", so today's search finds nothing. The parts search finds a part from the words typed, in any
order and any form, best match first, and stays quick with a full catalogue (about 60,000 parts a dealer).

- **In:** word search over the description (every word, any order, word forms, every word as a beginning); the part
  number found in full, by its beginning or by a part of it, in that order, first; best match first unless a column
  sort is chosen; a 60,000-part catalogue in the large sample data; fast under the ACME-117 load.
- **Out:** misspelt words (ACME-120 does names); other locations' stock (ACME-104); highlighting the matched words (an
  open point on the ticket); the list's text filters (description, part number), which stay as they are.

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Search "pads brake front" → "Brake pad set, front" at the top of the description matches
- [x] Search "filters" → parts described "filter" (oil, air, cabin)
- [x] Search "brake pa" and "brak pads" → brake pads found (every word as a beginning)
- [x] Search a part number in full → that part first; its beginning ("BRK-PAD") → the parts starting with it before
      any whose number only contains it; a part from the middle ("482913") → still found, after those
- [x] A search with no column sort → part-number matches first (as above), then the best description matches; a column
      sort → that column's order; no search → part-number order, as today
- [x] "pads for the Focus" → searched as "pads Focus" (the small words ignored)
- [x] At Northside with the large sample data, a search answers in tens of milliseconds; in the busy-morning run,
      parts searches are no slower than customer searches; the other parts lists measured at the new size (D5)

Failure: invalid input, absent data, not allowed, another service down

- [x] Search a part only Northside stocks, at Riverside → not shown, nor counted; another dealer's part with the same
      words, a deleted part, a part in a deleted bin → never shown, never counted
- [x] Search words that match nothing → no rows, and the list's "No parts match" text
- [x] Search only punctuation or small words ("the", "--") → no rows unless a part number holds that text, never an
      error
- [x] A search with quotes, `&`, `|`, `!`, `:`, `*`, `%` or `_` in it → treated as text (`%` and `_` match only
      themselves in a part number), never a 500

## Load before building

| Item                                                    | Kind     | Why                                                  | Loaded? |
| ------------------------------------------------------- | -------- | ---------------------------------------------------- | ------- |
| `build-api-endpoint`                                    | Skill    | the list handler, its unit of work, its tests        | [x]     |
| `docs/standards/multi-tenancy.md` (search rule)         | Standard | `@@` is not leakproof: the owner path for the search | [x]     |
| `docs/standards/database.md` "Migrations on big tables" | Standard | the generated column and its indexes on `parts`      | [x]     |
| `docs/standards/business-handlers.md`                   | Standard | a query handler's shape                              | [x]     |

## Shape

**Follows:** the customer search (`GetCustomerListQueryHandler.findScopedAsync`: ids and the count found as the owner
with the dealer, the location and `notDeleted(…)` written out, rows then read as the request; ACME-119). The no-search
list stays under the policy, as today: no text condition, so the policy and its indexes serve it. · **Deviates:** None

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/persistence/schema/columns/tsvector-column.ts` (**new**): a Drizzle custom type
   `tsvector`, like `money-column.ts`
2. `backend/dealership-api/src/persistence/schema/parts.ts`: `searchWords`, a stored generated `tsvector`
   (`to_tsvector('english', description)`), its GIN index, and a trigram GIN index on `upper(part_number)`
3. `backend/dealership-api/src/persistence/migrations/drizzle/<new>_parts_word_search/migration.sql` (**new**, by
   `bun run db:generate`, then edited): `SET LOCAL lock_timeout = '5s'`; the column; both indexes with `IF NOT EXISTS`
   (built `CONCURRENTLY` by hand in production first)
4. `backend/dealership-api/src/business-logic/list-query/like-pattern.ts` (**new**): `escapeLike(text)` (`\`, `%` and
   `_` escaped), used by the parts search; today's parts search escapes nothing
5. `backend/dealership-api/src/business-logic/handlers/parts/get-list/part-words.ts` (**new**):
   `toPartWordsQuery(search)` → the `to_tsquery` text or `null`: words of letters and digits only, each quoted and a
   beginning (`:*`), joined with `&`; nothing else from the search reaches the query syntax
6. `backend/dealership-api/src/business-logic/handlers/parts/part.queries.ts`: with a search,
   `findMatchingPartIdsAsync` (**new**, owner path) returns the page's ids in rank order and the count; the rows are
   read as the request by those ids, in that order
7. `backend/dealership-api/src/business-logic/handlers/parts/get-list/get-part-list.query-handler.ts`: a second unit
   of work as the owner when searching (as the customer list does)
8. Tests: `get-list/__test__/get-part-list.query-handler.test.ts` (real Postgres), `get-list/__test__/part-words.test.ts`
   (**new**), `list-query/__test__/like-pattern.test.ts` (**new**)
9. `scripts/seed-bulk.ts`: a 60,000-part Northwind catalogue (families × positions × fitments, catalogue-style
   numbers), stocked 40% at Northside, 30% at Riverside, 20% at Westgate in their seeded bins; `ANALYZE parts,
part_inventories`
10. `scripts/load-test.ts`: a "parts search" entry with catalogue words, beside "customer search"
11. `docs/standards/multi-tenancy.md`: the parts search joins the customer search under the owner-path rule;
    `README.md` `seed:bulk` line names the parts

```ts
// part-words.ts (new): "brak pads fr" → "'brak':* & 'pads':* & 'fr':*"; "--" → null
export function toPartWordsQuery(search: string): string | null {
  const words = search.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length === 0 ? null : words.map((word) => `'${word}':*`).join(" & ");
}

// part.queries.ts: the search's ids, as the owner, every scope written out (bins too: a filter or sort may name it)
const typed = search.toUpperCase();
const contains = sql`upper(${parts.partNumber}) LIKE ${`%${escapeLike(typed)}%`}`;    // trigram index
const words = toPartWordsQuery(search);
const wordsMatch = words ? sql`${parts.searchWords} @@ to_tsquery('english', ${words})` : null; // GIN index
const where = and(
  eq(parts.dealerId, dealerId), eq(partInventories.locationId, locationId), eq(bins.locationId, locationId),
  notDeleted(parts), notDeleted(partInventories), notDeleted(bins),
  wordsMatch ? or(contains, wordsMatch) : contains, listFilter(STOCKED_PART_COLUMNS, query));
// from part_inventories join parts join bins, as stockedParts joins them
const order = query.sort ? listOrderBy(…) : [
  asc(sql`CASE WHEN upper(${parts.partNumber}) = ${typed} THEN 0
               WHEN upper(${parts.partNumber}) LIKE ${`${escapeLike(typed)}%`} THEN 1
               WHEN ${contains} THEN 2 ELSE 3 END`),                                   // number, start, middle
  desc(wordsMatch ? sql`ts_rank_cd(${parts.searchWords}, to_tsquery('english', ${words}))` : sql`0`),
  asc(parts.partNumber), asc(parts.id)];
// count: the same from and where, as the owner; then the rows: stockedParts(…, inArray(parts.id, ids)) as the request,
// put back in the ids' order
```

A search of only small words ("the") gives a `to_tsquery` with no terms: Postgres matches nothing (with a notice), so
the part-number half alone decides.

**Impact:** Breaking changes: a fragment from the middle of a description word no longer finds it ("rak" no longer
finds "brake"; a beginning does), agreed by Zafar Ali (D2) · Depends on: `pg_trgm` (ACME-119) · Performance: GIN on
the stored vector and a trigram GIN on the part number, used on the owner path where the policy cannot hide them; one
more index per part save. The column is `STORED`, so adding it rewrites `parts` under an exclusive lock: `parts` is a
catalogue (60,000 rows a dealer, a few hundred thousand in all), so the rewrite takes seconds, timed in step 2 at the
bulk size; in production it runs in a quiet window, failing fast on the lock (`lock_timeout`) rather than queueing
saves. With the catalogue loaded, every parts endpoint runs at the new size, not only search: the no-search list
(under the policy, counted on every page), one part, stock value; step 6 measures them too.

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                  | Proves                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                    | `part-words.test.ts`                  | words only, quoted, each a beginning; punctuation and tsquery operators never pass; empty → null                                                                                                                                                                                                                                                          |
| Unit                    | `like-pattern.test.ts`                | `%`, `_` and `\` escaped                                                                                                                                                                                                                                                                                                                                  |
| Handler (real Postgres) | `get-part-list.query-handler.test.ts` | any order, word forms, beginnings; number, start, middle, then words (a containing number that sorts before the real one alphabetically still comes after it); a sort wins; another location's, another dealer's, deleted and deleted-bin parts never shown and never in `total`; nothing matches → empty; operators, `%` and `_` → no error, `%` literal |
| Live                    | step 6                                | the plans use both indexes at the real size; the busy-morning run                                                                                                                                                                                                                                                                                         |

## Steps

- [x] 1. `escapeLike` and `toPartWordsQuery` with their tests first → verify: fail, then pass
- [x] 2. The column type, the column, the indexes, the migration (`db:generate`, then the big-table edits) → verify:
      `bun run db:migrate`; read-only SQL `SELECT count(*) FROM parts WHERE search_words IS NULL` = 0; after step 4,
      the migration's `ALTER TABLE` timed on a copy of `parts` at the bulk size
- [x] 3. The owner-path search in `part.queries.ts` and the handler, tests first → verify: the handler tests fail, then
      pass
- [x] 4. The catalogue in `seed:bulk` → verify: `bun run seed:bulk` (after `bun run reset`): 60,000 Northwind parts,
      stocked as planned, in its time printed
- [x] 5. The "parts search" entry in the load test, docs, gates → verify: `bun run gate:fast`
- [x] 6. Measured: `bun run sql:explain` for "pads brake front", "filters", "BRK-PAD" at Northside (both indexes
      used, tens of ms); `bun run api as maria GET "/api/dealership/v1/parts?search=…"` for each box; `bun run
load-test --rate 200 --people 20 --writes 5` → verify: parts search p95 beside customer search p95, and the
      parts list, one part and stock value against the run before the catalogue, in the Log
- [x] 7. `verify-ticket` → verify: `docs/evidence/ACME-123.md`, every box cited

## Questions

None open. The interview settled four (a new ticket on the Parts list, words in any order with word forms, best match
first, a 60,000-part catalogue); the architect round raised two, answered by Zafar Ali (D1, D2).

## Decisions

- D1 A part from the middle of a part number still finds the part, ranked after the number itself and the numbers that
  start with it (Zafar Ali, 9 Nov, over "beginning only" and "the same rank as the start").
- D2 Every word typed counts as a beginning, so "brak pads" finds brake pads; a fragment from the middle of a word stops
  finding it (Zafar Ali, 9 Nov, over keeping middle fragments ranked lower, or only the last word as a beginning).
- D3 English word forms ("english" text search) on the description, the part number by text (trigram): a part number
  is a code, not words.
- D4 A stored generated column over an expression index: ranking reads the vector of every match, and the column keeps
  the query and the index one expression.
- D5 The plain parts list, its count on every page and stock value, slow at the catalogue's size (40 to 55 ms a call
  under the policy, a misestimated join reading the location's whole stock), are measured here and left to a
  follow-up ticket, over widening this one: the ticket asks for the search; the architect's finding 9 asked for them to
  be measured. Needs Zafar Ali's agreement.

## Log

- 2026-11-09 00:44 Plan written from ACME-123 and the interview (all four recommended answers). Read:
  `part.queries.ts` (ILIKE on number and description, under the policy, counted every page),
  `get-part-list.query-handler.ts`, `parts.ts` (only the unique part-number index), the customer search's owner path,
  `multi-tenancy.md`, `database.md` "Migrations on big tables", `seed-bulk.ts` (customers only; no parts).
- 2026-11-09 00:48 Architect: CHANGES, 10 findings, all taken. Two were product questions, answered by Zafar Ali: a middle
  part-number fragment still finds, after the number and its starts (D1); every word a beginning (D2). The order now
  ranks number, start, middle (a containing number could have come first), with a test. The owner query joins
  `bins` with its location and `notDeleted` (a filter or sort may name it). The count's own test (other locations,
  dealers, deleted parts and bins). A "parts search" entry in the load test. The `STORED` column's table rewrite stated
  and timed. `escapeLike` and the `tsvector` type marked new, with a `%`/`_` test. The fill check named. The other
  parts endpoints measured at the new size. D3/D4 (already the rule) removed.
- 2026-11-09 00:58 Go-ahead (Zafar Ali: "continue once the architect review is back"). Loaded the four rows.
- 2026-11-09 01:03 Step 1: `like-pattern.test.ts` and `part-words.test.ts` failed first (no modules), then 8 passed. Checked in the
  running Postgres (read-only): `to_tsquery('english', 'brak':* & 'pads':* & 'for':* & 'the':* & 'Focus':*)` →
  `'brak':* & 'pad':* & 'focus':*`; "Brake pad set, front" matches; "filters" matches "Oil filter"; only "the" → empty,
  matches nothing.
- 2026-11-09 01:03 Step 2 (in part): `tsvector` type, `search_words` (stored, generated), `ix_parts_search_words` (GIN),
  `ix_parts_part_number_trigram` (GIN, `upper(part_number)`); `db:generate` left out NOT NULL that its snapshot records:
  written into the migration, with `lock_timeout` and `IF NOT EXISTS`. Applied to the running database (`db:migrate`
  with `DATABASE_URL`): 40 parts, 0 without words. Timing at the bulk size after step 4.
- 2026-11-09 01:03 Step 3: 5 handler tests failed first (4; the scoping one already held under today's search), then all 14 passed:
  words in any order, word forms, beginnings, small words; number, start, middle, then words ("ACLT-KIT-1" after
  "CLT-KIT-12"); closest description first, a sort wins; other location, other dealer, deleted part, deleted bin
  never shown or counted; `%`, `_`, quotes and operators as text. Tests share one database: each uses its own numbers.
- 2026-11-09 01:15 Step 4: `seed:bulk 0 0 0` (the customer book was already loaded): 60,000 Northwind parts and stock in 1.8 s;
  Northside 24,211, Riverside 17,823, Westgate 12,125 stocked (40, 30, 20%); 0 parts without words.
- 2026-11-09 01:15 Step 2 (end): on a temporary copy of `parts` at 60,040 rows, rolled back: the column's rewrite 209 ms, the words
  index 55 ms, the part-number index 120 ms. Under half a second of lock at a dealer's catalogue.
- 2026-11-09 01:15 Step 5: "parts search" in the load test (16 counter searches; parts list 9 → 6, search 5); `multi-tenancy.md`,
  `README.md`; `gate:fast` passed.
- 2026-11-09 01:15 Step 6: before (old ILIKE search, catalogue loaded), `load-test --rate 200 --people 20 --writes 5`: 1,019 busy,
  p50 657 ms; parts statements about 40% of database time (search rows 94 ms, its count 90, list page 72, list count
  54, stock value 51 mean). After (restart): 22 busy, p50 135 ms; parts search p95 1.19 s, customer search 1.29 s.
  Explained as the owner at Northside: "brake pads front" both GIN indexes, page 24 ms, count 7 ms; "filters" (3,256
  matches) and "BRK-PAD-20" read the location's stock, 40 to 52 ms each for page and count. So the total now comes
  with the page (`count(*) over ()`; a count only for a page past the last; a test). Restarted: 83 busy, p50 68 ms,
  parts search p50 82 ms (244 before), p95 1.90 s against customer search 1.72 s; the tails swing run to run at
  this rate on the laptop. The by-ids read: 0.5 ms (explained). Each box by `bun run api as maria … ?search=`:
  "pads brake front" 389, "Brake pad set, front" in the top five behind "Front brake pads"; "filters" 3,256 (oil,
  air, cabin, fuel); "brake pa" and "brak pads" 776; "BRK-PAD-2000297", "brk-pad-200029", "000297" each 1, that
  part; "pads for the Focus" 34, Focus pads; "hovercraft", "the", "--", "50%", "tag' | !x" 0, no error; a
  Northside-only part at Riverside: 0. Found: the plain list, its count and stock value at catalogue size (D5).
- 2026-11-09 01:24 Step 7: verifier PASS, every requirement: words, forms, beginnings, numbers, order, sort, scope (maria at
  Riverside, rita at Westgate, tom at City Motors), symbols, paging, the plans (22, 58, 39 ms), the load run (parts
  search p50 63 / p95 322 ms against customer search 127 / 521), the screens. Notes: long descriptions cut at the
  grid's column edge (always so; the catalogue makes it common); D5 still to agree. Evidence: `docs/evidence/ACME-123.md`.
