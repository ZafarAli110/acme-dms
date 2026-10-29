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
