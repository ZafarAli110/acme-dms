# ACME-108: Export the customer list to Excel

**Created:** 2026-11-03 23:43

**Status:** Done

**Ticket:** ACME-108 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Follows: the Customers list and the top bar. The Export button sits on the list; progress and the download
sit in a downloads button in the top bar.

**Now:** Done: the Export to Excel button on the Customers list asks to confirm, queues a job, shows its progress in
the top bar, lets the person cancel, and gives a signed download link when the file is ready · Next: none · Blocked:
None

## Requirement

Maria, the Service Manager, wants the Customers list as an Excel file, exactly as she sees it, even at Northside with
over a million customers. She can keep working while it is made, and cancel it.

- **In:** an **Export to Excel** button on the Customers list; a background job; progress, cancel and download.
- **Out:** exporting other lists (Parts will follow), and scheduled or emailed exports.

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log. One line each: a verb, then what is seen.

Happy

- [x] Export with a search, filter and sort → the file holds every customer the list would show, all pages, in the same
      order
- [x] Hide a column, then export → the file has the visible columns only, in the list's order, under the list's headings
- [x] Open the file in Excel → dates are real dates and amounts and numbers are numbers
- [x] Export Northside's 1.6 million customers → a file Excel can open, with every customer, split over two sheets
- [x] Start an export → the top bar shows progress, how far it has got and roughly how long is left, and the app stays
      usable
- [x] Press Cancel while it runs → the export stops and nothing is downloaded
- [x] Export as Sam while Maria exports → everyone else keeps working normally, and several exports run at once

Failure: invalid input, absent data, not allowed, another service down

- [x] Ask for a column or sort the list does not have → it is refused (400) before anything is queued
- [x] Press Export again with the same Idempotency-Key → the same export comes back, not a second one
- [x] Start a third export while two are running or waiting → refused with 429 and a Retry-After
- [x] Open an export of another user or another location → nothing is found
- [x] Use a download link that is wrong or has expired → the file is refused

## Load before building

| Item                                      | Kind     | Why                                                      | Loaded? |
| ----------------------------------------- | -------- | -------------------------------------------------------- | ------- |
| `export-large-list`                       | Skill    | the six steps learned from this ticket's first build     | [x]     |
| `build-api-endpoint`                      | Skill    | the controller, handler, DTO and test layout             | [x]     |
| `docs/standards/business-handlers.md`     | Standard | where a handler, a job and its source live               | [x]     |
| `docs/standards/multi-tenancy.md`         | Standard | dealer on every row; location for location-scoped data   | [x]     |
| `docs/standards/database.md` "Migrations" | Standard | a table and its changes go in a migration                | [x]     |
| `docs/lessons/ACME-108.md`                | Lessons  | L1 to L6: stream, one query, sheets, stop, batches, file | [x]     |

## Shape

**Follows:** the customer list's own query (`customerListWhere`, `customerListOrderBy`) · **Deviates:** the export
runs in a separate worker process, not in the request. A file made first, then fetched by a signed link, is lesson L6.

Files (each checked to exist, or marked **new**):

1. `backend/dealership-api/src/service/controllers/exports/customer-export-command.controller.ts` (**new**): `POST
v1/customers/exports`, answers 202
2. `backend/dealership-api/src/service/controllers/exports/export.controller.ts` (**new**): list, one job, events,
   cancel, and the file by signed link with `Range`
3. `backend/dealership-api/src/business-logic/handlers/customers/export/start-customer-export.command-handler.ts`
   (**new**): checks the request and queues the job
4. `backend/dealership-api/src/business-logic/handlers/customers/export/customer-export-columns.ts` (**new**): the
   columns a customer export may hold
5. `backend/dealership-api/src/business-logic/exports/sources/customer-export-source.ts` (**new**): the list's where,
   order and columns as an export source
6. `backend/dealership-api/src/business-logic/exports/export-queue.ts` (**new**): `ExportQueue`: enqueue, limits,
   cancel, signed links
7. `backend/dealership-api/src/business-logic/exports/export-worker.ts` (**new**): `ExportWorker`: claim, count,
   stream, heartbeat, sweep
8. `backend/dealership-api/src/business-logic/exports/xlsx/xlsx-workbook-writer.ts` (**new**): writes rows into the
   zip as they arrive
9. `backend/dealership-api/src/business-logic/exports/download-link.ts` (**new**): signs and checks the links
10. `backend/dealership-api/src/persistence/schema/export-jobs.ts` (**new**): the `export_jobs` table
11. `backend/dealership-api/src/dto/exports/export-request.dto.ts` (**new**): the list's query plus `columns`
12. `web/app/core/kernel/exportKernel.ts` (**new**): follows each job and keeps the cards
13. `web/app/components/exports/ExportsButton.tsx` (**new**): the downloads button in the top bar, with
    `ExportCard.tsx` and `ExportConfirmDialog.tsx`
14. `web/app/pages/customers/CustomerList.tsx`: the Export button; sends the list's query and visible columns

High-level code: the key pieces.

```ts
// start-customer-export.command-handler.ts
public async executeAsync(userContext: UserContext, request: ExportRequestDto, idempotencyKey: string | null): Promise<ExportJobResponseDto> {
  const scope = { dealerId: userContext.dealerId, locationId: requireLocation(userContext) };
  // built now only to refuse a bad column, sort or filter (400) before anything is queued
  const source = customerExportSource(scope, request, this._clock.now());
  return this._exportQueue.enqueueAsync(userContext, { kind: "customers", request, source }, idempotencyKey);
}
```

```ts
// customer-export-source.ts: exactly what the list shows, at this location
const where = and(
  eq(customers.dealerId, scope.dealerId),
  eq(customers.locationId, scope.locationId),
  notDeleted(customers),
  customerListWhere(request),
);
const orderBy = customerListOrderBy(request);
```

```ts
// export-worker.ts, writeFileAsync: one snapshot, one query, streamed
await work.db.execute(sql`set transaction isolation level repeatable read`);
total = await source.countAsync(work.db);
const rows = work.stream(source.rowsQuery(work.db), this._settings.exportBatchSize);
for await (const row of rows as AsyncIterable<XlsxRow>) {
  await writer.writeRowAsync(row); // a new sheet every MAX_DATA_ROWS_PER_SHEET (1_048_575)
  progress.rows++;
}
```

The worker renames the part file to `<jobId>-<attempt>.xlsx` and then `completeAsync` records it, only if the attempt
still holds the job. Otherwise it removes its own file.

**Impact:** Breaking changes: None · Depends on: the `export_jobs` table (three migrations under
`backend/dealership-api/src/persistence/migrations/drizzle/`), the worker process (`bun run worker` in
`backend/dealership-api`), and `EXPORT_LINK_KEY` outside development · Performance: sized for 1.6 million customers at
Northside; `bun run seed:bulk` loads them. Rows are never held in memory, and a cursor reads `EXPORT_BATCH_SIZE` rows at
a time.

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                                                                                                         | Proves                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Handler (real Postgres) | `backend/dealership-api/src/business-logic/handlers/customers/export/__test__/start-customer-export.command-handler.test.ts` | the rows the list shows, this location's only; bad columns refused; keys; owner  |
| Queue (real Postgres)   | `backend/dealership-api/src/business-logic/exports/__test__/export-queue.test.ts`                                            | 429 at the limit, idempotency, cancel, list, unclaimed jobs failed               |
| Worker (real Postgres)  | `backend/dealership-api/src/business-logic/exports/__test__/export-worker.test.ts`                                           | fair turns, retry then fail, expiry, late attempts ignored, cancel stops a count |
| Unit                    | `backend/dealership-api/src/business-logic/exports/__test__/download-link.test.ts`                                           | links work on any instance with the shared key; wrong or expired ones refused    |
| Unit                    | `backend/dealership-api/src/business-logic/exports/xlsx/__test__/xlsx-cells.test.ts`                                         | characters XML cannot hold; text starting with `=` stays text                    |
| Unit (web)              | `web/app/core/kernel/__test__/exportKernel.test.ts`                                                                          | cards follow, reconnect, resend a start, forget on sign-out                      |
| End to end (Playwright) | `web/e2e/export.spec.ts`                                                                                                     | export, follow, download; cancel; the panel survives a reload                    |

## Steps

- [x] 1. Seed the real sizes: `scripts/seed-bulk.ts` → verify: 1.6 million customers at Northside
- [x] 2. Stream rows into an Excel file, splitting sheets: `XlsxWorkbookWriter` → verify: `bun run xlsx:inspect`
- [x] 3. Build the export source from the list's own where, order and columns → verify: handler test
- [x] 4. Add the `export_jobs` table and `ExportQueue` → verify: queue test
- [x] 5. Add `ExportWorker`: claim, heartbeat, sweep, cancel → verify: worker test
- [x] 6. Add the controllers and signed download links → verify: link test and the e2e download
- [x] 7. Add the export kernel, top-bar panel, confirm dialog and the list's button → verify: kernel test and e2e
- [x] 8. Check the whole ticket → verify: the Log

## Questions

None.

## Decisions

- D1 A background job in a table and a separate worker, over streaming into the response: any server can answer about
  a job, a restart loses nothing, and a slow download no longer holds a database connection (L6).
- D2 A user may have two exports running or waiting, then 429: one person cannot fill the workers.
- D3 The file expires after a time and the link is signed: no bearer token, so the browser saves it straight to disk.
- D4 The export asks for confirmation first: a million-row file is not one click away by accident.

## Log

- 2026-11-03 22:09 `991cf1b` The progress bar is determinate from the start; the export asks for confirmation. The e2e
  tests confirm it.
- 2026-11-03 22:41 `86d7352` Downloads button in the top bar: a ring while an export runs, a dot when one is ready.
- 2026-11-03 23:16 `b94752d` The job's response is built in `export-job.mapper.ts`; the Excel writer moved to
  `exports/xlsx/`.
- 2026-11-03 23:43 `9150b9e` Exports run as background jobs in a table and a worker. The queue, worker and sweeper are
  covered by `export-queue.test.ts` and `export-worker.test.ts`.
- 2026-11-04 02:23 `94c9422` A character XML cannot carry no longer corrupts the workbook (`xlsx-cells.test.ts`).
- 2026-11-06 15:19 `6b6fc96` `final`: the harness and these exports brought together.
- 2026-11-06 22:21 `4c6de50` Idempotency key and limit are per user across locations.
- 2026-11-07 20:01 `c353253` Files and writes fenced by attempt, orphan sweep, shared link key, status CHECK.
- 2026-11-07 21:53 `5073a25` An export no worker took fails after 30 minutes; a cancel stops a long count at once.
- Evidence from `docs/lessons/ACME-108.md`, measured on 1.6 million rows: streamed export 7.1 s, peak 212 MB, other
  requests 1 ms (p50); `bun run xlsx:inspect` showed sheet 1 with 1,048,576 rows (header + 1,048,575) and sheet 2 with
  551,426, the order carrying on.
- Checked with `bun run xlsx:inspect <file>` and the tests above; this plan records no new run.
