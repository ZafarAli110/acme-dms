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

1. **Decide the scope of the data first.** Dealer-wide or one location? (`docs/standards/multi-tenancy.md`, the table.)
   Location-scoped: the handler calls `requireLocation(userContext)` and the repository method takes `locationId` and
   filters by it. Nothing filters locations for you.
2. DTOs in `dto/<area>/`: responses are interfaces with every field present (`null`, never missing); requests are
   validated classes.
3. Handler interface and DI token in `business-logic-abstractions/handlers/<area>/<use-case>/`.
4. Handler in `business-logic/handlers/<area>/<use-case>/`: `<Verb><Thing>QueryHandler` or `…CommandHandler`, one
   public `executeAsync`. Time comes from the injected `CLOCK`; expected failures throw the exceptions in
   `business-handlers.md` "Expected failures", so they become problem details.
5. Repository method: starts from `forDealer(dealerId)` (which also leaves deleted rows out), adds the location
   filter for location-scoped data, adds `isDeleted = false` to every join, ends in `Async`.
6. A unit test next to the handler in `__test__/`, with `fixedClock()` and a mocked repository. It must fail if the
   rule the ticket is about were broken: for location-scoped data, assert the repository is called with the user's
   `locationId` (as `get-list/__test__` does). The repository's own filter is proved in the running system (step 9).
7. Register the handler in the module; add the action to `<Resource>Controller` (read) or `<Resource>CommandController`
   (write) with `@RequirePermission(...)`.
8. A schema change is a new migration (`docs/standards/database.md`), never an edit to one that exists.
9. Call it: `bun run api as <user> <METHOD> /api/dealership/v1/...`, as two users at different locations when the data
   is per location.
