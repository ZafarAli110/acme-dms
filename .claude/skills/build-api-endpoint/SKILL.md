---
name: build-api-endpoint
description: Adds an API endpoint, or changes what one returns or saves, in dealership-api (NestJS, Drizzle) or the .NET services - from the scope of the data to the DTOs, handler, controller and its test. Use when a ticket needs data the API does not give yet, or a new rule when something is read or saved.
---

# An API endpoint

An endpoint is a controller action that calls one business handler (a query reads, a command writes). The rules are
in `docs/standards/business-handlers.md`; this is the order to apply them in. Copy the nearest existing endpoint of the
same kind rather than starting from a blank file:

| Kind                                | Copy (dealership-api, under `business-logic/handlers/`)      |
| ----------------------------------- | ------------------------------------------------------------ |
| a list for the user's location      | `customers/get-list/` (search, one sort, one filter, paging) |
| one record                          | `customers/get/`                                             |
| create, with a uniqueness check     | `bins/create/` (and its `__test__/`)                         |
| change some fields (PATCH)          | `parts/update/`; with files, also the `upload-files` skill   |
| identity-api or document-api (.NET) | `references/dotnet.md`                                       |

## 1. Decide whose data it is, first

Every row belongs to one dealer, and some data to one location (`docs/standards/multi-tenancy.md`, the table).
In dealership-api Postgres row-level security filters for you: the request's queries see only its dealer's rows, and a
location-scoped table only its location's. Say only what is the handler's own: a location is required. Not
deleted is the database's too.

```ts
// ✅ the location is required (400 without one); the policies pick dealer, location and live rows
requireLocation(userContext);
await work.db.select().from(bins);

// ❌ the dealer and the location by hand: repeats the policy, and drifts from it
await work.db
  .select()
  .from(bins)
  .where(and(eq(bins.dealerId, userContext.dealerId), eq(bins.locationId, locationId)));
```

The dealer and the location come from `userContext` (the token), never from the request, and an insert sets them from
it. Another dealer's id is invisible to the policy, so it answers "not found". A new table needs its policy in its
migration (a test fails without one). Code outside a request (a worker, a consumer) is not filtered and must name the
dealer itself.

## 2. The DTOs (`dto/<area>/`)

- **A response** is an `interface` with every field present: `null` for no value, never left out.
- **A request** is a Valibot `v.strictObject` schema, its type taken from it (`v.InferOutput`), given to the parameter
  (`@Body({ schema: PartCreateRequestSchema })`). It holds only what the user may set: never `dealerId`,
  `locationId`, `id` or audit fields.
- **A rule's message** comes from the catalogs' `validation.*`: `toValidationMessage` (`service/validation/valibot-pipe.ts`)
  maps each Valibot action to one. A new kind of action gets its case there, and a case in `request-schemas.test.ts`.
  A new field name goes into `fields.*` of both catalogs. A `@Body()` or `@Query()` with no `{ schema }` is checked by
  nothing: a test refuses it.
- **A PATCH request** keeps three states apart for each optional field (`coding-standards.md`):

```ts
// the schema: may be left out; when sent, must be valid; a required field also refuses null
description: v.optional(v.pipe(v.string(), v.nonEmpty(), v.maxLength(500))),

// the handler: left out keeps, null clears, a value sets
.set({ ...(request.description === undefined ? {} : { description: request.description }) })
```

## 3. The handler

- Interface and DI token in `business-logic-abstractions/handlers/<area>/<name>/`; the class in
  `business-logic/handlers/<area>/<name>/`: `<Verb><Thing>QueryHandler` or `…CommandHandler`, one public
  `executeAsync`.
- Data through the unit of work: `await using work = await this._unitOfWorkFactory.beginAsync()` (`{ readOnly: true }`
  for a query), Drizzle on the table's own file (`#persistence/schema/customers`), `await work.commitAsync()` after a write. No repositories; a
  query several handlers share is a function next to the mapper (`parts/part.queries.ts`).
- Time from the injected clock (`this._clock.now()`); audit columns from `createdAudit` / `updatedAudit`.
- An expected failure throws the Nest exception (`NotFoundException`, `ConflictException` for a duplicate) with a
  catalog key, `localized("errors.<key>", { … })`, added to `src/i18n/catalogs/en.ts` and `fr.ts`; it becomes problem
  details in the user's language (`api-errors.md`). Validate before writing anything.
- Copy only the fields this endpoint changes into `.set(...)` / `.values(...)`; never spread the request into them.
- A record people edit (customers, parts) has a `version`: `GET` one and every save is `@ETagged()`, a save takes
  `@IfMatchVersion()` and updates `where … eq(table.version, expected)` with `version: sql\`${table.version} + 1\``;
nothing updated but the record exists is `412` (`api-errors.md`).

```ts
// ✅ create: check, then insert with the dealer, the location and the audit columns (CreateBinCommandHandler)
if (existing) {
  throw new ConflictException(localized("errors.binExists", { code: request.code }));
}
const [bin] = await work.db
  .insert(bins)
  .values({
    dealerId: userContext.dealerId,
    locationId,
    code: request.code,
    description: request.description,
    ...createdAudit(userContext.userId, this._clock.now()),
  })
  .returning();
await work.commitAsync();
```

## 4. The controller

`<Resource>Controller` for reads, `<Resource>CommandController` for writes, in `service/controllers/<area>/`. Every
action has `@RequirePermission(…)`: without it any signed-in user may call it. Register the handler and, for a new
resource, both controllers in the module.

```ts
@Post()
@HttpCode(HttpStatus.CREATED)
@RequirePermission("parts.write")
public createAsync(@CurrentUser() userContext: UserContext, @Body({ schema: BinCreateRequestSchema }) request: BinCreateRequestDto): Promise<BinResponseDto> {
  return this._createBinCommandHandler.executeAsync(userContext, request);
}
```

A list takes `@Query({ schema: ListQuerySchema }) query: ListQueryDto` and returns `PageResponseDto<T>`: one sort, one filter, a page size of at most 100, ordered
to the id (`business-handlers.md`, "List endpoints").

## 5. The test (`__test__/`, a real Postgres)

`useTestDatabase()`, `fixedClock()`, the users in `#test-setup/users/test-users`. Seed the rows that must come back
**and the ones that must not**: another dealer's, another location's, a deleted one. Then assert exactly what came
back (`bins/get-list/__test__`). A write is tested for its conflict, and a PATCH for each state of each optional field.

## 6. A schema change

Edit `persistence/schema/`: a new business table has `dealer_id`, `location_id` when it is location-scoped,
`auditColumns()`, the soft-delete check, and an index led by the columns every query filters on. Run
`bun run db:generate` in `backend/dealership-api` and read the SQL it writes. Never edit a committed migration.

## 7. Call it

`bun run api as <user> <METHOD> /api/dealership/v1/…`: as a user with the permission and one without, and as users at
two locations when the data is per location.
