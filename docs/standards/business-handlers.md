# Business handlers

One use case is one handler. It is the only place business rules live.

## Shape

```
controller ──► IXxxQueryHandler / IXxxCommandHandler ──► XxxQueryHandler / XxxCommandHandler ──► repository
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

## Expected failures

| Stack  | Throw                                          | Becomes                                     |
| ------ | ---------------------------------------------- | ------------------------------------------- |
| NestJS | `NotFoundException`, `ConflictException`, …    | problem details (`standards/api-errors.md`) |
| .NET   | `ApiException(ApiErrorCategory.NotFound, "…")` | problem details via `ApiExceptionHandler`   |

## Adding a use case

1. Request/response DTOs in `dto/` (responses are interfaces/records; requests are validated classes).
2. Handler interface + token in `business-logic-abstractions/handlers/<area>/<use-case>/`.
3. Handler in `business-logic/handlers/<area>/<use-case>/`, with a unit test.
4. Register the handler.
5. An action on the resource's controller in `service/controllers/<area>/`: `<Resource>Controller` for a read,
   `<Resource>CommandController` for a write. A new resource gets both, registered in the app module.
6. The permission it needs (`@RequirePermission` / `[RequirePermission]`).
