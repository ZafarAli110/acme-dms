# Acme DMS

A dealership management system: identity-api and document-api (.NET 10), dealership-api (NestJS), a YARP gateway and a
React web app, run together by Aspire. `README.md` explains the business, the demo users and every command.

## Rules that apply to every change

- **Many dealers, one database.** Northwind Motors and City Motors share every table. **Postgres row-level security
  filters for you** in dealership-api: a request's queries see only its dealer's rows, and location-scoped data (customers,
  cars, inventory, bins, appointments) only its location's. A handler does not repeat `dealerId` or `locationId` in its
  `where`; it still calls `requireLocation(userContext)` (a request with no location is a 400, not an empty list), and sets `dealerId` and `locationId` on every insert. Deleted rows are
  left out the same way (a policy per table): no `notDeleted` in a request, and a delete goes through `softDeleteAsync`.
  Code outside a request (export worker, consumer,
  seed) is not filtered and names the dealer and `notDeleted` itself. Every new business table gets its policy in its migration. Read
  `docs/standards/multi-tenancy.md` before touching any data.
- **One use case, one handler.** controller → handler interface → handler → unit of work. Controllers stay thin.
  Handlers query with Drizzle through `await using work = await this._unitOfWorkFactory.beginAsync()`; no
  repositories. `docs/standards/business-handlers.md`.
- **Tests run against a real Postgres** (Testcontainers, Docker or Podman): seed the rows that must come back and the
  ones that must not (another dealer's, another location's, a deleted one).
- **Check permissions, never role names.**
- **DTOs are contracts:** every field always present, `null` for no value. A `PUT` sends every field; a `PATCH` only
  what changed. A request DTO is a Valibot schema,
  its type taken from it; a controller gives it to the parameter (`@Body({ schema })`).
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
- **Read only what you need.** Find with the Grep and Glob tools first, then read the lines you need, not whole files
  or several at once: everything read stays in the conversation and is paid for again on every turn. In a shell
  command, quote every pattern (`--include='*.ts'`): zsh on macOS stops at an unquoted `*`, and quoting works in
  every shell, Git Bash and PowerShell too.
- **Plan before code.** Turn the task into checks first: a bug gets a test that reproduces it, a rule gets a
  test for the case it forbids. Then show the open questions and the plan, one check per step
  (`1. [step] → verify: [check]`), and wait for a go-ahead. Done is every check passing, not the code written.

## Commands

| Command                                 | Use                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bun run gate:fast`                     | format check, lint, typecheck, tests for changed projects                                       |
| `bunx nx test @acme/dealership-api`     | one project's tests                                                                             |
| `bun run api as <user> <METHOD> <path>` | call the running system as a demo user (`--location <x>`; `--body`: the JSON alone, to pipe on) |
| `bun run sql:explain "<select>"`        | how Postgres runs a query on the running data: its plan, read-only                              |
| `bun run errors`                        | failed requests across all services                                                             |
| `bun run reset`                         | back to the seeded data                                                                         |
| `bun run start` / `bun run stop`        | start the whole system in the background / stop it                                              |
| `bun run rebuild <service>`             | rebuild one .NET service from source and restart it                                             |

`api`, `errors` and `reset` need the system running: check with `bun run status`, and `bun run start` it if it is not.
dealership-api and web reload themselves; after changing identity-api, document-api or gateway-api, rebuild it.

## Done means

1. `bun run gate:fast` passes.
2. The change works in the running system, shown with `bun run api` as the users it affects. Anything per location is
   checked as two users at **different** locations: `sam` at Northside and `rita` at Westgate (`--location westgate`),
   a rooftop sam doesn't work at. `maria`, the manager, works at all three. Anything stored is also checked as `tom`
   (City Motors, another dealer): he must see none of it, and an id of Northwind's must be "not found" for him.
3. `bun run errors` shows nothing new.
4. Every screen the change adds or alters has been looked at: screenshots at 1440 and 1024 wide with the
   `check-in-browser` skill, read and described. Nothing overlaps, spills out or is cut off.

Say what you ran and what it returned. "Should work" is not done. Before calling a ticket done, run the `verify-ticket`
skill (`/verify-ticket <KEY>`): it runs the gate and the **verifier** subagent, and writes `docs/evidence/<KEY>.md`.
The **clean-code-reviewer** reads the diff once, when the pull request is opened, not before.

## Where to find what

`docs/ARCHITECTURE.md` (services and layers), `docs/standards/` (the team's rules), `docs/contracts.md` (messages),
`README.md` "Where to find what". Follow an existing feature of the same kind before inventing a new shape.

The skills in `.claude/skills/` hold the procedures for the common kinds of change: an API endpoint, file uploads, a
call to another service, a web form page.

Before a person merges: `/qa-ticket <KEY>` has the **qa** subagent test it in the running system, in a browser on screen,
with its plan, results and screenshots on the ticket, and a bug for each failure; when QA is clean, `/write-retro <KEY>` writes what went wrong as lessons with evidence (`docs/lessons/`), and
`/learn-from-lessons` turns lessons that apply again into skills. A skill is the team's memory; a person approves each
one.

`/ticket-to-pr <KEY>` runs a ticket with agents from the plan to a reviewed pull request: an **architect** agent
approves the plan, specialist reviewers check the pull request. It stops for any product question; a person merges.
`/resolve-pr-comments <number>` fixes a pull request's open review comments and answers them in one comment.

Work a ticket with `/implement-ticket <KEY>`. Its plan, `.ai-plans/<date>_<KEY>_<name>.md`, is the record of the work:
if one exists, read it before doing anything else on that ticket.

The backlog is the **acme-tracker** MCP server (`.mcp.json`): read a ticket with `get_ticket` rather than asking for it
to be pasted. Moving a ticket or commenting on it is visible to the whole team.
