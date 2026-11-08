# ACME-123: Find a part by the words people use

Verified 2026-11-09 on final (on 0a6efe6, the change uncommitted), with the large sample data (1.6 million customers at
Northside, and the new 60,000-part Northwind catalogue) and `bun run start:prod --load-test` (4 copies). The verifier
passed every requirement.

| Requirement                                               | Command                                                                                                       | Expected                                          | Got                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Every word, any order                                     | `bun run api as maria --body GET "/api/dealership/v1/parts?search=pads%20brake%20front"`                      | brake pad sets, front, at the top                 | 389; "Front brake pads, ceramic" first, then "Brake pad set, front, …"                                                            |
| Word forms                                                | `…?search=filters`; `…?search=pads` and `…?search=pad`                                                        | filters; pads = pad                               | 3,256 (oil, air, cabin, fuel); 776 each, the same set                                                                             |
| A word still being typed, and every word a beginning      | `…?search=brake%20pa`, `…?search=brak%20pads`; "brake pa" typed in the Parts search box                       | brake pads                                        | 776 each; the screen "1–25 of 776", brake pads at the top                                                                         |
| A part number in full, its beginning, a part of it        | `…?search=BRK-PAD-2000297`, `…?search=brk-pad-200029`, `…?search=000297`, `…?search=BRK-PAD`                  | that part first                                   | 1, that part, for each; "BRK-PAD": 776, all starting BRK-PAD                                                                      |
| The order: number, start, middle, then words; a sort wins | `get-part-list.query-handler.test.ts`; `…?search=brake%20pads&sort=unitPriceCents&direction=desc`; no search  | as described; the sort's order; part-number order | pass ("ACLT-KIT-1" after "CLT-KIT-12"); prices descending; no search: part-number order (24,211)                                  |
| The small words ignored                                   | `…?search=pads%20for%20the%20Focus`, `…?search=the`                                                           | Focus pads; nothing                               | 34 Focus brake pads; 0                                                                                                            |
| Only this location, this dealer                           | `bun run api as maria --location riverside …?search=BRK-PAD-2000297`; `as rita --location westgate`; `as tom` | not shown, not counted                            | Riverside 0; Westgate 0 (its own 395 brake pads); City Motors only its own part, Northwind's id 404; the handler test counts none |
| Nothing matches; symbols are text                         | `…?search=hovercraft`; `the`, `--`, `50%`, `tag' \| !x`, `(x):* <->`, `_`, `brk_pad`                          | no rows, "No parts match"; 200, never a 500       | 0, the empty-state text; all 200                                                                                                  |
| Paging                                                    | `…?search=brake%20pads&page=32`, `&page=40`                                                                   | the total kept                                    | 776 both (1 row; none)                                                                                                            |
| Fast at the catalogue's size                              | `bun run sql:explain` of the owner query at Northside                                                         | tens of ms                                        | "pads brake front" both GIN indexes, 22 ms; "filters" (3,256) 58 ms; "BRK-PAD" 39 ms                                              |
| As fast as customer search on a busy morning              | `bun run load-test --rate 200 --people 20 --writes 5 --seconds 60`                                            | parts search ≤ customer search                    | 0 busy, 0 failed; parts search p50 63, p95 322 ms; customer search p50 127, p95 521 ms                                            |
| The migration at the catalogue's size                     | the migration's statements on a rolled-back copy of `parts` (60,040 rows)                                     | seconds at most                                   | column 209 ms, indexes 55 and 120 ms                                                                                              |
| Screens                                                   | screenshots at 1440 and 1024: search results, no match                                                        | nothing overlaps; the list as today               | as today; long catalogue descriptions are cut at the column edge (see below)                                                      |
| No errors                                                 | `bun run errors`                                                                                              | none from the checks                              | none after the checks began                                                                                                       |

Gate: `bun run gate:fast` passed.

## What these checks don't prove

- **The plain parts list, its count on every page and stock value are slow at the catalogue's size** (40 to 55 ms a
  call; p50 128 ms for the list in the load run, the slowest list): a misestimated join reads the location's whole
  stock. Not this ticket's search; proposed as a follow-up (plan D5, waiting on Zafar Ali).
- A common word ("filters") or a part number's beginning shared by thousands reads the location's stock rather than
  the indexes (40 to 58 ms): fine at 24,000 stocked parts, worth re-measuring for a location that stocks far more.
- The Parts grid cuts long descriptions at the column edge with no visible ellipsis (the full text is in the cell's
  tooltip). The grid always did; the catalogue's longer descriptions make it common. A small grid fix could follow.
- The load-test tails swing run to run on one laptop (parts search p95 0.32 to 1.9 s across runs); medians were
  steady.
