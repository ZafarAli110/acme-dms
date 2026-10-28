# Acme DMS

A dealership management system: identity-api and document-api (.NET 10), dealership-api (NestJS), a YARP gateway and a
React web app, run together by Aspire. `README.md` explains the business, the demo users and every command.

## Rules that apply to every change

- **One client, three locations.** This deployment serves one client (Northwind Motors), so nothing filters by dealer. A
  **location is filtered nowhere for you**: every query of location-scoped data (customers, cars, inventory, bins,
  appointments) filters by `requireLocation(userContext)` in its own `where`. Read `docs/standards/multi-tenancy.md`
  before touching any of that data.
- **One use case, one handler.** controller → handler interface → handler → unit of work. Controllers stay thin.
  Handlers query with Drizzle through `await using work = await this._unitOfWorkFactory.beginAsync()`; no
  repositories. `docs/standards/business-handlers.md`.
- **Tests run against a real Postgres** (Testcontainers, Docker or Podman): seed the rows that must come back and the
  ones that must not (another location's, a deleted one).
- **Check permissions, never role names.**
- **DTOs are contracts:** every field always present, `null` for no value. A `PUT` sends every field; a `PATCH` only
  what changed.
- **Errors are problem details** (`docs/standards/api-errors.md`). A field's error (a duplicate, `409`) is shown on
  that field.
- **A record and its files are saved as one unit**, or not at all. `docs/standards/file-uploads.md`.
- **Messages go through the outbox**; a consumer exists for every event published. `docs/standards/messaging.md`.
- **Database:** audit columns and soft delete on every business table; never edit a migration that has run, add a new
  one. `docs/standards/database.md`.
- **Time is UTC**, through the injected clock (`IClock` / `CLOCK`), never `new Date()` or `DateTime.Now`.
- **Web:** route modules with `clientLoader`/`clientAction`; forms are schema → mapper → form → page; every text the
  user sees is translated (en and fr). `docs/standards/web-architecture.md`.
- **Style:** `docs/standards/coding-standards.md`. Anything asynchronous ends in `Async`; private fields start with
  `_`; no `utils`, `helpers` or `common` folders.

## Commands

| Command                                 | Use                                                       |
| --------------------------------------- | --------------------------------------------------------- |
| `bun run gate:fast`                     | format check, lint, typecheck, tests for changed projects |
| `bunx nx test @acme/dealership-api`     | one project's tests                                       |
| `bun run api as <user> <METHOD> <path>` | call the running system as a demo user (`--location <x>`) |
| `bun run errors`                        | failed requests across all services                       |
| `bun run reset`                         | back to the seeded data                                   |

The system must already be running (`bun run dev`) for `api`, `errors` and `reset`. Do not start or stop it yourself.

## Done means

1. `bun run gate:fast` passes.
2. The change works in the running system, shown with `bun run api` as the users it affects. Anything per location is
   checked as two users at **different** locations: `sam` at Northside and `rita` at Westgate (`--location westgate`),
   a rooftop sam doesn't work at. `maria`, the manager, works at all three.
3. `bun run errors` shows nothing new.

Say what you ran and what it returned. "Should work" is not done. Before calling a ticket done, have the **verifier**
subagent check it, and the **standards-reviewer** subagent review the diff.

## Where to find what

`docs/ARCHITECTURE.md` (services and layers), `docs/standards/` (the team's rules), `contracts/README.md` (messages),
`README.md` "Where to find what". Follow an existing feature of the same kind before inventing a new shape.

The backlog is the **acme-tracker** MCP server (`.mcp.json`): read a ticket with `get_ticket` rather than asking for it
to be pasted. Moving a ticket or commenting on it is visible to the whole team.
