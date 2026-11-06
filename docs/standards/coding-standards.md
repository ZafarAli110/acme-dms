# Coding standards

## Both stacks

- Folders and projects are named for what they hold. No `common`, `utils`, `helpers` or `misc`.
- Import from the file that declares the thing (`#persistence/schema/customers`), never through a barrel: an
  `index.ts` that only re-exports others. A barrel makes every import of one name load, parse and type-check
  everything it re-exports, in the build, the type checker and every test file that touches it.
- Packages are pinned to an exact version (`5.2.2`, never `^5`), and never one published less than 7 days ago
  (`bunfig.toml`: `exact`, `minimumReleaseAge`), so a compromised release cannot reach us before it is caught. A
  security fix may come sooner: list the package in `minimumReleaseAgeExcludes` in the same commit and say why. .NET
  packages are pinned in `Directory.Packages.props`.
- Request-pipeline classes live in folders by kind: `middleware/`, `guards/`, `filters/`, `interceptors/` in NestJS
  (`service/…`), `Middleware/` in .NET (`Acme.ServiceDefaults`). What they use (decorators, settings, DTOs) stays with
  its concern: `authentication/`, `authorization/`, `problem-details/`.
- Private fields start with `_`; methods never do.
- Class members always say `public` or `private` (constructors too). Methods are methods, never arrow-function
  properties; where a method is passed as a callback, wrap it at that point (`(listener) => kernel.subscribe(listener)`)
  or in a small named function.
- Anything asynchronous ends in `Async`: methods, functions and API-object members that return a promise or `Task`
  (`executeAsync`, `findByIdAsync`, `dealershipApi.getPartsAsync`). Framework hooks keep their framework names
  (`canActivate`, `onModuleInit`, migrations' `up`/`down`).
- Constructor injection assigns explicit backing fields (`this._unitOfWorkFactory = unitOfWorkFactory;` /
  `_dbContext = dbContext;`). No TypeScript parameter properties, no C# primary constructors for services.
- DTOs are contracts: every field is always present; a missing value is `null`, never left out. The one exception is
  a PATCH request body: it carries only the fields to change, and a field left out keeps its value.
- Updates: PATCH when the client changes some fields (`PATCH /v1/parts/{id}`); PUT when it sets the whole thing
  (`PUT /v1/stock/{partId}` sets quantity and reorder level together; `PUT /v1/customers/{id}` sends every field).
  A record people edit has a `version`, and its saves need `If-Match` (`api-errors.md`, "Saving a record someone
  else changed").
- **A PATCH field has three states**, and the request DTO, the handler and the tests keep all three apart:

  | In the PATCH body      | Means           | The handler               |
  | ---------------------- | --------------- | ------------------------- |
  | left out (`undefined`) | keep the value  | does not touch the column |
  | `null`                 | clear the value | sets the column to `null` |
  | a value                | set the value   | sets the column           |

  A required field has only two states: `v.optional(v.pipe(v.string(), v.nonEmpty()))` lets it be left out but
  rejects `null` (`PartUpdateRequestSchema.description`); `v.nullable(…)` is for a value that may be cleared. Test each state of each optional field:
  one test that leaves it out, one that sends `null`, one that sends a value.

  ```ts
  // ✅ each state kept apart (UpdatePartCommandHandler); `notes` stands for any optional field
  .set({
    ...(request.description === undefined ? {} : { description: request.description }),
    ...(request.notes === undefined ? {} : { notes: request.notes }), // null clears it
  })

  // ❌ a truthy check: a price of 0 is never saved, and notes sent as null are never cleared
  ...(request.unitPrice ? { unitPrice: request.unitPrice } : {}),
  ...(request.notes ? { notes: request.notes } : {}),
  ```

- Time: a moment (created, updated, processed) is stored as `timestamptz` and is UTC everywhere, and is sent as ISO
  8601 with `Z` (`2026-10-28T09:15:00.000Z`). A calendar day with no time (a customer's last contact) is a `date`,
  sent as `YYYY-MM-DD`, so a time zone can never move it to the day before.
  - TypeScript uses Temporal, never `Date`: `Temporal.Instant` for a moment, `Temporal.PlainDate` for a day. Entities
    hold them through the column transformers in `persistence/transformers/`; mappers send `toIsoString(instant)`.
  - Handlers get the current time from the injected clock (`@Inject(CLOCK) clock: IClock`, `this._clock.now()`),
    never from the system; tests pass `fixedClock()`. .NET does the same with `TimeProvider.GetUtcNow()`.
  - Screens format with Intl through `core/formatters/formatDate.ts` (`formatInstant`, `formatPlainDate`,
    `formatDaysAgo`), in the user's language; never a fixed locale.
- Check permissions, never role names.
- Routes: `v1/<resource>` in services; the gateway adds `/api/<service>`.

## TypeScript (dealership-api, web)

- ESM with no file extensions in imports (`import {partQueries} from './queries/partQueries'`): every TypeScript
  project here is bundled (Bun for dealership-api, Vite for web) or run by Bun, so `moduleResolution` is `Bundler`.
  dealership-api's cross-layer imports use the `#layer/…` aliases, which point at the `.ts` files
  (`"#business-logic/*": "./src/business-logic/*.ts"`). Package paths stay as the package publishes them.
- Named exports only. A default export only where a tool requires one (a React Router route module's component, its
  `routes.tsx`, `root.tsx`, and config files), and then a named function: `export default function SignIn() {…}`.
- React components are `function` declarations with PascalCase names (`export function PartForm() {…}`), never arrow
  functions or JSX held in a constant. Inside a component (or a hook), event handlers and callbacks are arrow functions
  held in a `const` (`const openPart = (part: PartListItem): void => {…};`), never nested `function` declarations.
- Group siblings with `<Fragment>` (imported from `react`), never the empty `<>…</>`.
- A new row or DTO is a typed object literal (`const photo: NewPartPhoto = {…}`): the compiler then requires every
  field and refuses unknown ones. Never `Object.assign(new PartPhoto(), {…})`, which checks nothing. A change to an
  existing one is a typed spread (`const updated: Customer = {...customer, firstName: …}`).
- Response DTOs are `interface`s. Request DTOs are Valibot schemas (`v.strictObject({…})`) with their type taken from the schema
  (`export type PartCreateRequestDto = v.InferOutput<typeof PartCreateRequestSchema>`): the rules and the type are one
  declaration, and a field the schema does not have is refused. A controller gives the schema to its parameter
  (`@Body({ schema: PartCreateRequestSchema })`, `@Query({ schema: ListQuerySchema })`).
- Tests live in `__test__/` next to the code they test, and a `__test__/` folder holds only tests (`*.test.ts`);
  Vitest. What several tests share (the Testcontainers Postgres and `useTestDatabase()`, the seed kit, test users, a
  fixed clock, fakes of other services) is in `src/test-setup/`, imported as `#test-setup/...`. Production code never
  imports it.
- Data access goes through the unit of work and Drizzle (`standards/business-handlers.md`, "Data access"): no
  repository classes. Handler tests run against a real Postgres that Testcontainers starts (`useTestDatabase()`), not
  mocks: a test that can't see the SQL can't see a missing filter.
- **Use the platform first.** TypeScript targets ES2025 (Node 26, Bun and current browsers run all of it): `toSorted`,
  `Object.groupBy`, `Set#union`/`intersection`, iterator helpers (`Iterator.from(...).filter(...).toArray()`),
  `Promise.allSettled`/`Promise.try`/`Promise.withResolvers`, `AbortSignal.timeout`/`AbortSignal.any` instead of a
  hand-made timer, `structuredClone`, Temporal for time. A resource that must be released (a query runner, a lock, a
  temporary file) is held with `using` / `await using` (or a `DisposableStack`), not a `try`/`finally`.
- **No value is `null`, not `undefined`**, in our own types (as in the DTOs). Do not compare with `undefined` to mean
  something else: use the API's own answer (`fieldState.invalid`, `response.ok`), `??` for a default, and let a JSON
  log line drop the fields an object does not have. The one place `undefined` is the meaning is a PATCH request: a
  field that was not sent, which is not the same as `null`.
- **Calling another service** (dealership-api → document-api) goes through `rest-clients/`: a named client from
  `@nestjs/http-client` (native `fetch`, a timeout per attempt, retries of idempotent methods only) and a
  `@nestjs/resilience` preset of the same name (a circuit breaker). Retries happen in the HTTP client only, never in
  the preset as well, or attempts multiply. A refusal (4xx) keeps the other service's reason; anything else is a 503.
  Either way the original error is the `cause`.
- Format with `bun fmt`; lint with `oxlint` (layer rules in `backend/dealership-api/.oxlintrc.json`).

## C# (.NET services)

- Warnings are errors; analyzers at `latest-recommended`; `dotnet format` clean.
- No `ConfigureAwait(false)`: ASP.NET Core has no `SynchronizationContext`, so it changes nothing and only adds noise.
- `[LoggerMessage]` for log statements.
- EF Core with snake_case naming; migrations in the Persistence project (`dotnet ef migrations add …`).
- Controller actions return `ActionResult<TResponseDto>` (or `ActionResult` for a file) and simply await the handler.
  Expected failures are `ApiException`s; the service's `ApiExceptionHandler` turns them into problem details, like
  `ProblemDetailsFilter` does in NestJS. No try/catch or result wrappers in controllers.
- Handlers use the `DbContext` directly; no repository classes on top. EF Core already is a repository and unit of
  work, and its global query filter applies the dealer and soft delete to every query.
- Tests: MSTest + Moq in `tests/`, one test class per handler (`CreateTokenCommandHandlerTests`), test methods named
  `MethodUnderTest_Behaviour` (`ExecuteAsync_RejectsAWrongPassword`).
- Tests that touch the database run against a real Postgres, as dealership-api's do: Testcontainers starts one per
  test run (`postgres:18.3`), the service's migrations are applied once to a template database, and each test gets a
  copy of its own (`TestPostgres`). Never EF's in-memory provider: it runs no SQL, so it cannot show a query filter or
  a translation that fails on Postgres, and it checks no constraint (unique indexes, foreign keys, the soft-delete
  check).

## Before calling a change done

1. `bun run gate:fast` passes (format, lint, typecheck, tests).
2. The change works in the running system: call it with `bun run api as <user> …`, check `bun run errors`, and for
   anything asynchronous see `standards/messaging.md` ("Done means processed").
