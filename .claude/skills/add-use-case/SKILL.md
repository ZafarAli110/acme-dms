---
name: add-use-case
description: Adds an API use case (a read or a write) to dealership-api, identity-api or document-api, from DTO to controller, with its test. Use when a ticket needs a new endpoint or changes what an endpoint does.
---

# Add a use case

The rules are in `docs/standards/business-handlers.md`; this is the order to apply them in. Copy the nearest existing
use case of the same kind rather than starting from a blank file.

| Kind                                | Copy (dealership-api)                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| read a list for the user's location | `business-logic/handlers/customers/get-list/`                                                 |
| read one record                     | `business-logic/handlers/customers/get/`                                                      |
| create a record                     | `business-logic/handlers/customers/create/` (with `__test__/`)                                |
| update a record with its files      | `business-logic/handlers/parts/update/`, and the `save-record-with-files` skill               |
| .NET (document-api, identity-api)   | `Acme.Documents.BusinessLogic/Handlers/Documents/` and `tests/Acme.Documents.Tests/Handlers/` |

## Steps

1. **Decide the scope of the data first.** The whole client's, or one location's? (`docs/standards/multi-tenancy.md`,
   the table.) Location-scoped: every query filters `eq(<table>.locationId, requireLocation(userContext))` in its own
   `where`. Nothing filters locations for you.
2. DTOs in `dto/<area>/`: responses are interfaces with every field present (`null`, never missing); requests are
   validated classes.
3. Handler interface and DI token in `business-logic-abstractions/handlers/<area>/<use-case>/`.
4. Handler in `business-logic/handlers/<area>/<use-case>/`: `<Verb><Thing>QueryHandler` or `…CommandHandler`, one
   public `executeAsync`. Time comes from the injected `CLOCK`; expected failures throw the exceptions in
   `business-handlers.md` "Expected failures", so they become problem details.
5. Data access through the unit of work (inject `UNIT_OF_WORK_FACTORY`): `await using work = await
this._unitOfWorkFactory.beginAsync()` (`{readOnly: true}` for a query), Drizzle on `#persistence/schema/index`,
   `await work.commitAsync()` for a write. Every read of a business table, and every join, adds `notDeleted(table)`.
   Copy `bins/create` and `bins/get-list`. No repositories; a query several handlers share is a function next to the
   mapper (`parts/part.queries.ts`).
6. The test in `__test__/` runs against a real Postgres: `useTestDatabase()`, `fixedClock()`, the users in
   `business-logic/user-context/__test__/test-users.ts`. It must fail if the rule the ticket is about were broken: seed
   the rows that must come back **and the rows that must not** (another location's, a deleted one), as
   `bins/get-list/__test__` does.
7. Register the handler in the module; add the action to `<Resource>Controller` (read) or `<Resource>CommandController`
   (write) with `@RequirePermission(...)`.
8. A schema change: edit `persistence/schema/` (a new table spreads `auditColumns()` and has the soft-delete check),
   run `bun run db:generate` in `backend/dealership-api`, and read the SQL it writes. Never edit a migration that is
   already committed (`docs/standards/database.md`).
9. Call it: `bun run api as <user> <METHOD> /api/dealership/v1/...`, as two users at different locations when the data
   is per location.
