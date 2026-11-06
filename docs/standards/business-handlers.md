# Business handlers

One use case is one handler. It is the only place business rules live.

## Shape

```
controller ──► IXxxQueryHandler / IXxxCommandHandler ──► XxxQueryHandler / XxxCommandHandler ──► unit of work
```

- **Controllers are thin.** They read the request (route, query, body, file), get the user context, call exactly one handler
  per action and return its result. No rules, no data access.
- **One controller per resource, reads and writes apart:** `PartController` holds the queries, `PartCommandController`
  the commands (in .NET: `DocumentController` / `DocumentCommandController`). Action methods are plain verbs; the
  controller already names the resource and the route carries the version:
  - NestJS uses Nest's names: `findAllAsync`, `findOneAsync`, `createAsync`, `updateAsync`, `removeAsync`, plus a clear
    verb for anything else (`uploadPhotoAsync`, `searchAsync`).
  - .NET: `GetAsync`, `GetContentAsync`, `CreateAsync`, `UploadAsync`.
- **Handlers own the rules**: validation beyond shape, permissions that depend on data, limits, conflicts.
- **Handler names are verb first, as across IDS:** `GetPartQueryHandler` (reads), `CreatePartCommandHandler` (writes),
  with the interface `IGetPartQueryHandler`. Every handler has exactly one public method, `executeAsync` /
  `ExecuteAsync`. Files are named after their class. Folders do not repeat the entity, because the area folder already
  says it: `CreatePartCommandHandler` lives in `handlers/parts/create/create-part.command-handler.ts` (.NET:
  `Handlers/Documents/Upload/UploadDocumentCommandHandler.cs`).
- **DTOs are entity first:** `PartCreateRequestDto`, `PartResponseDto`, `PartListItemDto`. Messages are named as
  commands or events (`ProcessDocument`, `DocumentProcessed`), see `messaging.md`.
- **Interfaces and DI everywhere.** Controllers depend on the handler interface. In NestJS the interface comes with a
  DI token (`GET_PART_LIST_QUERY_HANDLER`) because Nest cannot inject interfaces.
- **Register every handler** in one place: `BusinessLogicModule` (NestJS) or `AddBusinessLogic()` (.NET).
- **The user context is passed explicitly.** Every handler that touches dealer data takes a `UserContext`
  (user, dealer, location, permissions). Handlers never read HTTP headers or tokens themselves.

## Data access: a unit of work, no repositories

A handler reads and writes the database through a **unit of work**: one connection and one transaction for one use
case, held with `await using` so it is always finished. `commitAsync()` keeps what was written; leaving the block
without a commit (a read, or an error) rolls it back.

```ts
await using work = await this._unitOfWorkFactory.beginAsync(); // {readOnly: true} for a query handler
const [bin] = await work.db.insert(bins).values({…, ...createdAudit(userContext.userId, this._clock.now())}).returning();
await work.commitAsync();
```

- **NestJS:** `work.db` is Drizzle on the schema in `persistence/schema/`, so tables, columns and results are typed
  and a wrong column fails the typecheck. Inject `UNIT_OF_WORK_FACTORY`; `bins/create` is the smallest example.
  Queries several handlers share are plain functions next to the mapper (`parts/part.queries.ts`). Nothing outside
  `persistence/unit-of-work/` may open a connection (a lint rule).
- **.NET:** the `DbContext` is the unit of work.
- Calls to another service never happen inside the transaction (`standards/file-uploads.md`).

## Expected failures

| Stack  | Throw                                          | Becomes                                     |
| ------ | ---------------------------------------------- | ------------------------------------------- |
| NestJS | `NotFoundException`, `ConflictException`, …    | problem details (`standards/api-errors.md`) |
| .NET   | `ApiException(ApiErrorCategory.NotFound, "…")` | problem details via `ApiExceptionHandler`   |

## What business-logic-abstractions holds

In dealership-api, `business-logic-abstractions/` holds the contracts between the layers: interfaces, their injection
tokens, and the plain types and constants they use. Every interface has an implementation: a handler in
`business-logic/handlers/`, the clock in `business-logic/time/`, a REST client in `rest-clients/`. A test fails when a
handler interface has no handler. A type two layers share (an error, a constant) may live here too; its comment says
what it means, never behaviour that another layer is supposed to have.

## Calling another service: the client carries, the handler decides

A REST client (`rest-clients/<service>/`) is how a request reaches another Acme service, and nothing more. Business
logic lives in the handler that calls it. The layer rules already keep a client away from the database and the
handlers (it may not import `#persistence/**` or `#business-logic/**`); this keeps it from growing logic of its own.

**One client method is one request** to one endpoint of the other service. It may:

- build the URL and the headers (the user's token and location, so the other service makes its own checks);
- turn our command into the other service's request, and its response into our type (its types are generated from
  its OpenAPI document: `bun run generate:clients`);
- run through the service's resilience preset, with retries for idempotent calls only (never an upload);
- translate failure: a refusal (4xx) keeps the other service's reason, anything else is `503 Service Unavailable`,
  the original error as the `cause`. A `404` on a delete may count as done ("already gone"): that is what an
  idempotent delete means, not a business rule, and the method says so.

It never:

- decides whether to call, or calls once per record in a loop;
- chains two requests, or cleans up after a failure (the handler deletes the documents it uploaded);
- checks our rules (file types, counts, permissions) or reads our data;
- knows our business words. A method or a branch that names something the other service has never heard of (a part,
  a default photo, a reorder level) is in the wrong place.

The handler depends on the interface in `business-logic-abstractions/rest-clients/`, never the class. The client's own
test checks only the transport (the request it sends, how it reads each answer); handler tests use the fake in
`src/test-setup/` and test the decisions.

## Adding a use case

1. Request/response DTOs in `dto/` (responses are interfaces/records; requests are validated classes).
2. Handler interface + token in `business-logic-abstractions/handlers/<area>/<use-case>/`.
3. Handler in `business-logic/handlers/<area>/<use-case>/`, with its test in `__test__/`: in NestJS against a real
   Postgres (`useTestDatabase()`), seeding what the test needs, including rows that must **not** come back (another
   location's, a deleted one).
4. Register the handler.
5. An action on the resource's controller in `service/controllers/<area>/`: `<Resource>Controller` for a read,
   `<Resource>CommandController` for a write. A new resource gets both, registered in the app module.
6. The permission it needs (`@RequirePermission` / `[RequirePermission]`).

## List endpoints: one sort, one filter

A list endpoint takes `ListQueryDto`: the page, a free-text `search`, and the data grid's one sort (`sort`,
`direction`) and one filter (`filterField`, `filterOperator`, `filterValue`). The list declares which fields can be
sorted and filtered, once, as `ListColumns` next to its handler (`CUSTOMER_LIST_COLUMNS`, `STOCKED_PART_COLUMNS`):
each field's SQL (a column, or an expression such as "surname, first name") and its type (`text`, `number`, `date`,
`choice`), which decides the operators. `listOrderBy()` and `listFilter()` (`business-logic/list-query/`) turn the query
into SQL; any other field or operator is a 400, so a sort or filter never reaches SQL as text. The sort always ends with
the id, so rows with equal values keep one order from page to page. Count with the same joins as the page.

## Work that outlives the request: exports

An export of a long list can't finish inside one request, so it runs as a background **job**: the request that starts
it returns at once (202) with the job's id, and the work happens after it, in another process. The job waits in line,
reports progress, can be cancelled, and its file expires. The user only ever sees "an export"; "job" is the run.

**The queue is a table.** Every export is a row in `export_jobs` (`persistence/schema/export-jobs.ts`): who asked
(`dealer_id`, `location_id`, `owner_id`), what for (`kind` and the validated `request`), and how it is going
(`status`, `rows`, `total_rows`, `heartbeat_at`, the file). It is an operational table like `processed_messages`: no
audit columns and no soft delete; rows are deleted outright once their file has long expired. Nothing lives in a
process's memory, so a restart of the API or of a worker loses no export.

**Two processes.** dealership-api only queues and reads: a start handler checks the request (a column, sort or filter
the list doesn't have is a 400 now, not after it has waited) and inserts the row. The **export worker**
(`service/worker.ts`, `bun run worker`, the `export-worker` resource in Aspire) claims waiting rows, counts and streams
the rows in one snapshot into an .xlsx (a temp file, renamed when complete), and writes progress to the row about once
a second. Following an export (`GET /v1/exports/{id}`, its server-sent events) reads the row; `GET /v1/exports` lists
the user's exports at the location, so a reloaded page shows them again. Both processes use the same `EXPORT_DIR`; in
production it would be object storage both reach.

The use case follows the shape above: `IStartCustomerExportCommandHandler` in
`business-logic-abstractions/handlers/customers/export/`, and its handler in `business-logic/handlers/customers/export/`.
What every export shares lives beside the handlers, in `business-logic/exports/`:

| File                                | What it is                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `export-queue.ts`                   | the API's side: queues, follows, lists and cancels jobs, checks download links |
| `export-worker.ts`                  | the worker's side: claims and runs jobs, heartbeats, the sweeper               |
| `export-worker.module.ts`           | what the worker process runs: the database, the clock, the worker              |
| `export-job.mapper.ts`              | a job's row as the client sees it (`ExportJobResponseDto`)                     |
| `export-source.ts`                  | what one list's export reads: file name, columns, count, rows query            |
| `export-sources.ts`                 | every exportable list by `kind`: how the worker rebuilds a job's queries       |
| `sources/customer-export-source.ts` | the customer list's export, built from its request                             |
| `download-link.ts`                  | the signed link the browser downloads the file with                            |
| `xlsx/xlsx-workbook-writer.ts`      | writes the rows into an .xlsx as they come, so memory stays flat               |
| `xlsx/xlsx-cells.ts`                | the small pieces of SpreadsheetML each cell is built from                      |

Controllers reach the queue through `EXPORT_JOBS` (`business-logic-abstractions/exports/`). A start handler takes the
queue class itself, and `ExportSource` stays in `business-logic`: it holds database queries, which the abstractions
may not depend on. `export-sources.ts` (the registry and `ExportSourceBuilder`) stays beside it for the same reason,
and because only this layer uses it: the start handler checks a request with it, the worker runs a job with it. A type
goes in the abstractions when another layer needs it, not because it is a type. A new export (parts, say) adds its
start handler, its source in `sources/` and one line in `export-sources.ts`.

### The limits

| Setting                            | Default | What it limits                                                                |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `EXPORT_MAX_PER_USER`              | 2       | a user's exports running or waiting; one more is a 429 with `Retry-After: 30` |
| `EXPORT_MAX_RUNNING`               | 5       | exports one worker runs at once (each holds a database connection)            |
| `EXPORT_MAX_RUNNING_PER_DEALER`    | 3       | one dealer's exports running across all workers                               |
| `EXPORT_STATEMENT_TIMEOUT_SECONDS` | 600     | one of an export's SQL statements (`SET LOCAL statement_timeout`)             |
| `EXPORT_MAX_SECONDS`               | 900     | a whole export; then it is failed ("Try a smaller filter.")                   |
| `EXPORT_STALE_SECONDS`             | 60      | silence before a running export counts as abandoned by its worker             |
| `EXPORT_TTL_SECONDS`               | 900     | how long a finished file can be downloaded                                    |

`EXPORT_POLL_MS` (how often a worker looks for work), `EXPORT_PROGRESS_POLL_MS` (how often a followed export is read
for the browser) and `EXPORT_BATCH_SIZE` (rows per round trip) tune the rest; all are in `settings/settings.ts`.

**Claiming is fair.** A worker claims as many waiting jobs as it has free slots, in one statement with
`FOR UPDATE SKIP LOCKED`, so two workers never take the same job. Jobs are ranked by how many their dealer already
has running plus their place in that dealer's line, so dealers take turns and one dealer exporting a lot never keeps
another's single export waiting. Two workers claiming at the same instant can put a dealer briefly over its limit; a
per-dealer advisory lock would close that if it ever mattered.

**The sweeper** runs in every worker every 15 seconds. A running job whose heartbeat is older than
`EXPORT_STALE_SECONDS` goes back to the line (its place kept) once, and is failed the second time ("The export stopped
responding. Try again."); a finished file past its time is deleted and the job marked expired; rows long past their
file are deleted. **No distributed lock:** each of these is one conditional `UPDATE` or `DELETE`, and Postgres lets
only one worker change a given row, so two sweepers at once do the work once. `@nestjs/locks` (official, v0.0.5) is
for work that must run on exactly one instance, such as a nightly report; this is not that.

**Cancelling:** a waiting export is cancelled at once; a running one gets `cancel_requested_at`, and its worker stops at
its next progress check (about a second) and marks it cancelled; a finished one's file is deleted now.
