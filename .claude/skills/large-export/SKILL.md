---
name: large-export
description: Builds an export (Excel or CSV) of a list or report that can be large, e.g. the customer list with a million rows. Use for any "export to Excel", "download as a file" or report of a table that can grow, in dealership-api and the web app.
---

# A large export

Learned from ACME-108 (`docs/lessons/ACME-108.md`). Each step names the lesson it comes from.

1. **A background job, not a request.** `POST /v1/<list>/exports` answers 202 with the job; the job writes a temp file
   and reports progress; the file is downloaded afterwards through a signed link with a length and `Range`, and
   expires. (L6) Reuse `ExportJobRunner` with an `ExportSource`; do not write a second runner.
2. **Exactly what the list shows.** Build the source from the list's own `…ListWhere` and `…ListOrderBy` (its
   location, search, filter and sort, ending with the id) and the visible columns in their order, under the headings
   the client sends.
3. **One query, streamed.** Count and rows in the same read-only snapshot; the rows through `UnitOfWork.stream`, never
   `.limit()`/`.offset()` pages and never the whole result in memory. (L1, L2) Batch size from `EXPORT_BATCH_SIZE`.
   (L5)
4. **Write as you read.** `XlsxWorkbookWriter`: rows go into the zip as XML with backpressure, a new sheet every
   1,048,575 data rows, dates and numbers typed. (L1, L3)
5. **Stopping is normal.** Cancel destroys the stream without an error and deletes the file; nothing emits an
   `'error'` that nobody listens for. (L4)
6. **The web app:** the grid toolbar's Export button sends `toListQueryBody(params)` and the visible columns with an
   Idempotency-Key; the export kernel follows the events and the export panel shows them.

## How to check

- `bun run seed:bulk`, then export Northside with no filter: `bun run xlsx:inspect <file>` shows every row the list's
  total says, across two sheets, header on each, the order carrying on. (L3)
- While it runs, time a Parts page (`curl -s -o /dev/null -w '%{time_total}'`): about as fast as without the export.
  dealership-api's memory (`ps -o rss= -p <pid>`) stays a few hundred MB. (L1)
- Cancel half way: the job ends `cancelled`, the file is gone, and the service is still up. Close a download half way:
  the service is still up. (L4)
- The same export started twice with one Idempotency-Key is one export.
