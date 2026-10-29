# ACME-108 Export the customer list to Excel: lessons

Answer key for the lab. Measured while building the export (29 Oct 2026, `spike/export-bench`), 1.6 million rows,
8 columns, sorted by an unindexed column, on an M4 laptop with Postgres in Docker. The agent's own retro should find
the same things from its own failures.

## L1 Stream the rows into the file; never load the whole result

- What happened: loading every row and building the workbook in memory (`exceljs` `Workbook`, `writeBuffer`) crashed
  the Node process: "JavaScript heap out of memory" at 4.3 GB after 8 s. In the API that takes the service down for
  everyone.
- Why: 1.6 million row objects plus the workbook's cell objects, all held at once.
- What fixed it: one query read through a server-side cursor (`UnitOfWork.stream`), each row written as XML into the
  zip as it arrives (`XlsxWorkbookWriter`), with backpressure.
- Evidence: the same export streamed: 7.1 s, peak 212 MB, other requests answered in 1 ms (p50) meanwhile.
- Applies when: any export, report or file made from a table that can grow.

## L2 Read one query, sorted once; not page after page

- What happened: reading the export with `limit`/`offset` pages took 45.8 s; each page sorts the table again.
- Why: an unindexed sort (the user can sort by any column) is redone for every page, and the offset is skipped again.
- What fixed it: one query, one sort, read in batches through a cursor.
- Evidence: offset 45.8 s, keyset on (column, id) without an index 23.3 s, one streamed query 7.1 s.
- Applies when: reading more rows than one page, in a user-chosen order.

## L3 Split the file into sheets at 1,048,575 data rows

- What happened: Northside's 1.2 million customers do not fit one sheet: Excel's limit is 1,048,576 rows.
- What fixed it: a new sheet, with the header, every 1,048,575 data rows.
- Evidence: `bun run xlsx:inspect` on 1.6 million rows: sheet 1 has 1,048,576 rows (header + 1,048,575), sheet 2 has
  551,426; the order carries on across the boundary.
- Applies when: any Excel export that can exceed a million rows.

## L4 Stop a stream without an error nobody listens for

- What happened: a user closing the download crashed the whole process, twice: in Nest, `Emitted 'error' event on
  PassThrough` (the writer destroyed its stream with an error); in Bun, `ReadableStream is locked` (cancelling a
  stream that was being piped).
- Why: an `'error'` event with no listener, or a throw in an abort handler, ends the process, not just the request.
- What fixed it: destroy without an error; cancel through the pipe's signal; the export catches and cleans up.
- Evidence: after the fix, a download cancelled at 5 s: the server stays up, the database connection is back in the
  pool, it logs "Export stopped: The client closed the download.", and the next download is byte-identical.
- Applies when: any stream that a client or a user can stop half way.

## L5 Fetch in big batches when the database is not next door

- What happened: with 40 ms between the service and Postgres the export took 20.1 s instead of 7 s.
- Why: 5,000 rows a fetch is 334 round trips.
- What fixed it: 20,000 rows a fetch by default, `EXPORT_BATCH_SIZE` to tune.
- Evidence: 5,000 a fetch: 20.1 s, 205 MB; 50,000: 7.8 s, 379 MB (45 round trips).
- Applies when: streaming many rows across a network.

## L6 Make the file first, then download it with a length

- What happened: streaming the file straight into the response tied the database connection and the export to the
  download: a slow client held both, a dropped connection meant starting again, and the browser could not show a size.
- What fixed it: a background job writes a temp file and reports progress; the download is a signed link with
  `Content-Length` and `Range`; the file expires after 15 minutes and leftovers go at start.
- Evidence: browser at 20 Mbit/s: the file was ready in 7.9 s and the connection released; the download took 12.9 s;
  a download broken at 10 MB resumed with `Range` (206) into the identical file.
- Applies when: any file that takes longer to make or fetch than a request should last.

## Unproven

- Count and rows in one snapshot (repeatable read), so the total shown equals the rows in the file: done, never seen
  failing here.
- A download held in browser memory (`fetch` then `Blob`) would hurt at this size, as the Astra export does with a
  114 MB file: not measured in Acme.
