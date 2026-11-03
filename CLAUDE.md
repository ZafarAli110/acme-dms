# Acme DMS

A dealership management system: identity-api and document-api (.NET 10), dealership-api (NestJS), a YARP gateway and a
React web app, run together by Aspire. `README.md` explains the business, the demo users and every command.

## Rules that apply to every change

- **Many dealers, one database.** Northwind Motors and City Motors share every table. **Nothing filters for you**:
  every query (reads, updates, deletes, and lookups by id) filters by `userContext.dealerId` in its own `where`, and
  every query of location-scoped data (customers, cars, inventory, bins, appointments) also by
  `requireLocation(userContext)`. Every insert sets `dealerId`. Read `docs/standards/multi-tenancy.md` before touching
  any data.
- **One use case, one handler.** controller → handler interface → handler → unit of work. Controllers stay thin.
  Handlers query with Drizzle through `await using work = await this._unitOfWorkFactory.beginAsync()`; no
  repositories. `docs/standards/business-handlers.md`.
- **Tests run against a real Postgres** (Testcontainers, Docker or Podman): seed the rows that must come back and the
  ones that must not (another dealer's, another location's, a deleted one).
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
- **Style:** `docs/standards/coding-standards.md`. Anything asynchronous ends in `Async`; private fields start with
  `_`; no `utils`, `helpers` or `common` folders.

## How to work

- **Verify, don't assume.** A fact has an answer in the code, the docs, the task or the running system: find it.
  A decision nobody has made yet: ask, saying what you checked and what you recommend. Never decide it silently.
- **Surface the trade-off.** Two reasonable ways: name both and say which you would pick.
- **What was asked, done completely.** No feature, option or abstraction nobody asked for, and nothing less
  either: the standards, the tests and the translations are part of the change. If doing it well needs a wider
  change (a refactor, a shared component), propose it with the trade-off; don't do it silently, and don't skip it.
- **Read only what you need.** Find with `grep` first, then read the lines you need, not whole files or several at
  once: everything read stays in the conversation and is paid for again on every turn.
- **Plan before code.** Turn the task into checks first: a bug gets a test that reproduces it, a rule gets a
  test for the case it forbids. Then show the open questions and the plan, one check per step
  (`1. [step] → verify: [check]`), and wait for a go-ahead. Done is every check passing, not the code written.

## Commands

| Command                                 | Use                                                       |
| --------------------------------------- | --------------------------------------------------------- |
| `bun run gate:fast`                     | format check, lint, typecheck, tests for changed projects |
| `bunx nx test @acme/dealership-api`     | one project's tests                                       |
| `bun run api as <user> <METHOD> <path>` | call the running system as a demo user (`--location <x>`) |
| `bun run errors`                        | failed requests across all services                       |
| `bun run reset`                         | back to the seeded data                                   |
| `bun run start` / `bun run stop`        | start the whole system in the background / stop it        |
| `bun run rebuild <service>`             | rebuild one .NET service from source and restart it       |

`api`, `errors` and `reset` need the system running: check with `bun run status`, and `bun run start` it if it is not.
dealership-api and web reload themselves; after changing identity-api, document-api or gateway-api, rebuild it.

## Done means

1. `bun run gate:fast` passes.
2. The change works in the running system, shown with `bun run api` as the users it affects. Anything per location is
   checked as two users at **different** locations: `sam` at Northside and `rita` at Westgate (`--location westgate`),
   a rooftop sam doesn't work at. `maria`, the manager, works at all three. Anything stored is also checked as `tom`
   (City Motors, another dealer): he must see none of it, and an id of Northwind's must be "not found" for him.
3. `bun run errors` shows nothing new.

Say what you ran and what it returned. "Should work" is not done. Before calling a ticket done, have the **verifier**
subagent check it, and the **clean-code-reviewer** subagent review the diff.

## Where to find what

`docs/ARCHITECTURE.md` (services and layers), `docs/standards/` (the team's rules), `contracts/README.md` (messages),
`README.md` "Where to find what". Follow an existing feature of the same kind before inventing a new shape. The skills
in `.claude/skills/` hold the procedures for the common kinds of change: an API endpoint, file uploads, a call to
another service, a web form page.

The backlog is the **acme-tracker** MCP server (`.mcp.json`): read a ticket with `get_ticket` rather than asking for it
to be pasted. Moving a ticket or commenting on it is visible to the whole team.
