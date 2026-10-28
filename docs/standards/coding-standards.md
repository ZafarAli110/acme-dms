# Coding standards

## Both stacks

- Folders and projects are named for what they hold. No `common`, `utils`, `helpers` or `misc`.
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
- Constructor injection assigns explicit backing fields (`this._partRepository = partRepository;` /
  `_partRepository = partRepository;`). No TypeScript parameter properties, no C# primary constructors for services.
- DTOs are contracts: every field is always present; a missing value is `null`, never left out. The one exception is
  a PATCH request body: it carries only the fields to change, and a field left out keeps its value.
- Updates: PATCH when the client changes some fields (`PATCH /v1/parts/{id}`); PUT when it sets the whole thing
  (`PUT /v1/stock/{partId}` sets quantity and reorder level together; `PUT /v1/customers/{id}` sends every field).
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
  functions or JSX held in a constant. Arrow functions are fine inside a component, for event handlers and callbacks.
- A new entity or DTO is a typed object literal (`const photo: PartPhoto = {id: …, …}`): the compiler then requires every
  field and refuses unknown ones. Never `Object.assign(new PartPhoto(), {…})`, which checks nothing. A change to an
  existing one is a typed spread (`const updated: Customer = {...customer, firstName: …}`).
- Response DTOs are `interface`s. Request DTOs are classes validated with `class-validator`.
- Tests live in `__test__/` next to the code they test; Vitest.
- Data access goes through a small repository per entity (`IPartRepository`). TypeORM has no global query filter, so
  the repository is where the dealer is applied (`DealerScopedRepository`) and where location-scoped methods take the
  location. Handlers depend on the interface, which keeps their tests free of query builders.
- Format with `bun fmt`; lint with `oxlint` (layer rules in `backend/dealership-api/.oxlintrc.json`).

## C# (.NET services)

- Warnings are errors; analyzers at `latest-recommended`; `dotnet format` clean.
- `ConfigureAwait(false)` on awaits in libraries; `[LoggerMessage]` for log statements.
- EF Core with snake_case naming; migrations in the Persistence project (`dotnet ef migrations add …`).
- Controller actions return `ActionResult<TResponseDto>` (or `ActionResult` for a file) and simply await the handler.
  Expected failures are `ApiException`s; the service's `ApiExceptionHandler` turns them into problem details, like
  `ProblemDetailsFilter` does in NestJS. No try/catch or result wrappers in controllers.
- Handlers use the `DbContext` directly; no repository classes on top. EF Core already is a repository and unit of
  work, and its global query filter applies the dealer to every query.
- Tests: MSTest + Moq in `tests/`, one test class per handler (`CreateTokenCommandHandlerTests`), test methods named
  `MethodUnderTest_Behaviour` (`ExecuteAsync_RejectsAWrongPassword`).

## Before calling a change done

1. `bun run gate:fast` passes (format, lint, typecheck, tests).
2. The change works in the running system: call it with `bun run api as <user> …`, check `bun run errors`, and for
   anything asynchronous see `standards/messaging.md` ("Done means processed").
