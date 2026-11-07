# Acme DMS

A small dealership management system (DMS) used for hands-on agentic engineering workshops with
[Claude Code](https://claude.com/claude-code): a ticket goes from the backlog to a verified, reviewed pull request. It is
deliberately realistic: three services in two languages behind a gateway, a message broker, multi-tenancy, a layered
architecture and real conventions.

- [The workshop: two repositories](#the-workshop-two-repositories)
- [Branches](#branches)
- [Working with Claude Code](#working-with-claude-code)
  - [The cost meter](#the-cost-meter)
  - [Spending tokens wisely](#spending-tokens-wisely)
- [The business](#the-business)
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Setup](#setup)
- [Run it](#run-it)
- [Look around a running system](#look-around-a-running-system)
- [Everyday commands](#everyday-commands)
- [Conventions](#conventions)
- [Running outside development](#running-outside-development)
- [Where to find what](#where-to-find-what)
- [Troubleshooting](#troubleshooting)

## The workshop: two repositories

Start with [tiny-harness](https://github.com/ZafarAli110/tiny-harness), the workshop's first session and a prerequisite
for this one: a tiny coding agent built in six steps on a small local model, showing what a harness is before you use
Claude Code's. Then this session's two repositories:

| Repository                                                  | What it is                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **acme-dms** (this one)                                     | the system the work is done on                                                                             |
| [Acme Tracker](https://github.com/ZafarAli110/acme-tracker) | its backlog: a small Jira-like tracker with a board, a backlog and a page per ticket (ACME-101, ACME-102…) |

People use Acme Tracker's web page; Claude Code uses its MCP server, so it can read a ticket, move it along the board,
comment on it and attach screenshots as evidence. Everything an agent does is marked on the board. From lab 02, this
repository's `.mcp.json` connects Claude Code to it. Run it beside Acme DMS, in a terminal of its own:

```bash
cd ~
git clone https://github.com/ZafarAli110/acme-tracker.git
cd acme-tracker
bun install
bun start            # http://localhost:4100 (the MCP server: http://localhost:4100/mcp)
```

The same in PowerShell. `bun run reset` in that folder (with the tracker stopped) puts every ticket back in To Do.

## Branches

`main` is the system alone, with no Claude Code setup. Each lab branch adds one piece of the harness (everything
around the model that makes it work well here) to the one before, so checking out a lab shows the repository as it
stands at that point of the workshop. `final` holds every piece.

| Branch                 | What it adds                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `main`                 | the system, its docs and standards; no Claude Code setup                                                                 |
| `lab/00-start`         | where the workshop starts: the system with a short README, no docs and no Claude Code setup                              |
| `lab/01-claude-md`     | `CLAUDE.md` (what Claude reads in every session) and the written standards in `docs/`                                    |
| `lab/02-mcp`           | `.mcp.json`: Acme Tracker's tickets as tools                                                                             |
| `lab/03-hooks`         | hooks: protected files, every edit formatted, the fast checks when Claude stops                                          |
| `lab/04-subagents`     | the `verifier` and `clean-code-reviewer` subagents                                                                       |
| `lab/05-permissions`   | what runs without asking, what asks, what never runs (**.claude/settings.json**), and the git policy                     |
| `lab/06-skills`        | skills for a form page, an API endpoint, uploads and calls between services; the web rules                               |
| `lab/07-verification`  | checking a screen in a real browser; `/verify-ticket` writes evidence anyone can re-run                                  |
| `lab/08-plans`         | plans that survive a restart (`/implement-ticket`), an architect review before any code, handoff notes                   |
| `lab/09-export-before` | QA and learning: `/qa-ticket`, `/write-retro`, `/learn-from-lessons`, the `qa` subagent                                  |
| `lab/09-export-after`  | the customer export as the lab builds it (ACME-108), and the `export-large-list` skill learnt from it                    |
| `lab/09-export-final`  | the customer export finished: a job queue and an `export-worker`                                                         |
| `lab/10-ticket-to-pr`  | ticket to reviewed pull request: specialist reviewers, `/ticket-to-pr`, `/review-pr`, `/resolve-pr-comments`             |
| `final`                | every lab, the finished export, and more: row-level security, soft delete, versions with `If-Match`, and **docs/plans/** |

A change to the system is made on `main` and carried to every lab branch and `final`, so they differ only in what the
table says. Switching to a branch that adds a package (lab 09-after does) needs `bun install` once.

**Every lab branch has its exercise in `LAB.md`**, at the repository's root: what the branch adds, the goal, the steps
(with the prompt to give Claude), what to notice, what the run roughly costs, and the branch to go to next. Start at
`lab/00-start` and follow each `LAB.md` to the next. `final` has `FINAL.md` in its place: every Acme ticket, whether it
is built yet, and how to build the next one with the whole harness.

## Working with Claude Code

On a lab branch from 01 on, start `claude` in the repository folder. What it finds there:

| Piece                               | What it does                                                                              | Lab |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | --- |
| `CLAUDE.md`                         | the project, the rules for every change, the commands, what done means; read every time   | 01  |
| `.mcp.json`                         | Acme Tracker as tools                                                                     | 02  |
| **.claude/hooks/**                  | scripts that run at fixed moments, every time: format, protect, check                     | 03  |
| **.claude/agents/**                 | subagents: verifier, reviewers (code, security, performance, tests, state), QA, architect | 04+ |
| **.claude/settings.json**           | permissions: allow, ask, deny                                                             | 05  |
| **.claude/skills/**                 | steps Claude loads only when a task needs them, and commands a person starts (`/name`)    | 06+ |
| `docs/evidence/`, `qa/`, `lessons/` | what verification, QA and retrospectives write                                            | 07+ |

A ticket's life on lab 10 and `final`:

```
/ticket-to-pr ACME-…  → plan → architect review → build, one step and its check at a time
                      → /verify-ticket (evidence) → pull request → specialist reviewers → fixes
                      → /qa-ticket (a visible browser, screenshots) → a person merges → /write-retro
```

[docs/HARNESS.md](https://github.com/ZafarAli110/acme-dms/blob/final/docs/HARNESS.md) (lab 10 and `final`) lists every piece: what it does, when it runs, who starts it and the lab that
added it. From lab 10, `/find-state-machines` sweeps the whole repository for stages nobody declared (a photo stuck in
`pending`, an export nobody finishes); on `final`, [docs/plans/implicit-state-machines.md](https://github.com/ZafarAli110/acme-dms/blob/final/docs/plans/implicit-state-machines.md) holds what it found and what
was fixed.

### The cost meter

Every lab spends real tokens, and a ticket run with several agents spends a lot of them. The cost meter, a Claude Code
plugin ([claude-code-cost-meter](https://github.com/ZafarAli110/claude-code-cost-meter)), shows what the work costs
while it runs: the estimated cost against a budget, the tokens and how many came from the cache, how full the context
window is, the model calls, and every subagent with its own time, tokens and cost. Lab 10 asks for it; install it before
lab 00 to see what every lab costs. Once, at the Claude Code prompt (the same on Windows, macOS and Linux):

```
/plugin install cost-meter --marketplace ZafarAli110/claude-code-cost-meter
```

Answer `y` and pick the **user** scope. The meter shows above the prompt; `/show-meter` opens it beside the chat,
`/show-meter reset` counts from zero just before a run, and `/show-meter budget 20` sets the budget (default $10).

**Keep it open while you do each exercise.** Before you start one: `/clear`, `/show-meter reset`, then `/show-meter`,
so the panel sits beside the chat for the whole run. When the run ends, read what it cost, which subagent spent the
most, and how much came from the cache; `/show-meter copy` puts the figures on the clipboard. Knowing what a plan, a
review round or a QA run costs is part of what the labs teach: compare the labs, and weigh each harness piece against
what it spends. How to spend less: [Spending tokens wisely](#spending-tokens-wisely).

### Spending tokens wisely

Anthropic's own guidance says how to spend less, and keeps it current:

- [Manage costs effectively](https://code.claude.com/docs/en/costs): tracking what a session costs, and the habits
  that cut it (`/usage`, `/context`, `/compact`, `/clear`, choosing the right model, keeping context small).
- [Model configuration](https://code.claude.com/docs/en/model-config): which model to use for what, and how to switch.
- [Prompt caching](https://code.claude.com/docs/en/prompt-caching): why re-sent context is cheap, and what ends the
  cache (switching models, a long break).
- [Pricing](https://platform.claude.com/docs/en/about-claude/pricing): what each model costs per million tokens.

## The business

**Acme** sells this DMS to dealer groups. Each **dealer** is a client with one or more **locations**: physical
dealership sites, often called "rooftops" in the motor trade. One deployment of Acme DMS serves every dealer from the
same databases, and every row says which dealer it belongs to. Within a dealer, some data is shared by all its
locations (the part master records) and some belongs to one location (each part's inventory and bin, customers,
vehicles, appointments, documents).

People hold a **role per location**, and roles grant **permissions** (`parts.write`, `stock.adjust`, ...).

| Dealer           | Locations                      |
| ---------------- | ------------------------------ |
| Northwind Motors | Northside, Riverside, Westgate |
| City Motors      | Central                        |

Demo users, all with the password **`Acme123!`**:

| User                   | Dealer           | Location(s) and role                              |
| ---------------------- | ---------------- | ------------------------------------------------- |
| `sam@northwind.test`   | Northwind Motors | Northside + Riverside: Service Advisor            |
| `rita@northwind.test`  | Northwind Motors | Riverside + Westgate: Service Advisor             |
| `maria@northwind.test` | Northwind Motors | Northside + Riverside + Westgate: Service Manager |
| `tom@citymotors.test`  | City Motors      | Central: Service Manager                          |

Maria assigns people to locations on the **Locations** page; a change shows within 15 minutes (the next time the gateway
renews that person's token), or at their next sign-in.
`bun run reset` puts everyone back on the locations above.

## What it does

| Area                              | API (through the gateway)                                                                                                         | Web                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sign-in                           | `POST`/`DELETE /api/session` (the gateway), `GET /api/identity/v1/users/me`; scripts: `POST /api/identity/v1/tokens`              | sign-in page, location switcher                                         |
| Parts (stocked per location)      | `GET/POST /api/dealership/v1/parts`, `GET/PATCH /api/dealership/v1/parts/{id}`                                                    | list, search, create (with bin), edit page                              |
| Bins (per location)               | `GET/POST /api/dealership/v1/bins`                                                                                                | bin picker when creating a part                                         |
| Part photos                       | saved with the part (`PATCH …/parts/{id}`, multipart); `POST …/parts/{id}/photos` adds one                                        | on the edit page: add, remove, default; processing                      |
| Stock (per location)              | `GET /api/dealership/v1/stock`, `PUT /api/dealership/v1/stock/{partId}`                                                           | — (ticket ACME-101)                                                     |
| Customers (per location)          | `GET/POST /api/dealership/v1/customers`, `GET/PUT …/customers/{id}`, `GET …/customers/recent`                                     | list, search, create, edit, recently contacted on Home                  |
| Documents                         | `POST /api/documents/v1/documents`, `GET …/{id}`, `GET …/{id}/content/{variant}`                                                  | images via `DocumentImage`                                              |
| Who am I                          | `GET /api/dealership/v1/system/user-context`                                                                                      | —                                                                       |
| Locations and people              | `GET /api/identity/v1/users`, `GET …/v1/locations`, `PUT`/`DELETE …/v1/users/{userId}/locations/{locationId}`                     | Locations page: a manager assigns people to locations                   |
| Customer export (lab 09-after on) | `POST /api/dealership/v1/customers/exports`, `GET /api/dealership/v1/exports[/{jobId}]`, `GET …/{jobId}/file`, `DELETE …/{jobId}` | export button on the customer list: an Excel file, its progress, cancel |

A part photo travels: dealership-api → document-api (stored, 202) → outbox → RabbitMQ → document-api's processor
(WebP `display` and `thumb` variants) → `document.processed.v1` → dealership-api marks the photo ready. A file that
cannot be processed is tried three times, then marked failed. A photo still `pending` after 10 minutes is marked timed
out, so it never waits forever, and a stored document no photo claims within a day is deleted
(`document.unclaimed.v1`). An event a service cannot handle after its retries goes to a dead-letter queue, and the
service logs a warning once a minute until someone replays it ([Troubleshooting](#troubleshooting)).
`docs/contracts.md` has every message and queue.

## Architecture

```
                             ┌─► identity-api (.NET)     ── Postgres: identity
web (React) ──► gateway-api ─┼─► dealership-api (NestJS) ── Postgres: dealership
                (YARP)       └─► document-api (.NET)     ── Postgres: documents
                  │
                  └── Postgres: gateway (the browsers' sign-ins)
                                       │     ▲
                                       └HTTP─┘   events via RabbitMQ
```

| Service          | Language            | Owns                                                                                          |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `identity-api`   | C# (.NET 10)        | dealers, locations, users, roles; issues access tokens (JWT)                                  |
| `dealership-api` | TypeScript (NestJS) | parts catalogue, stock and other dealership data                                              |
| `document-api`   | C# (.NET 10)        | photos and files, image processing                                                            |
| `gateway-api`    | C# (YARP)           | the only entry point: `/api/<service>/...` goes to that service; keeps the browsers' sign-ins |
| `web`            | TypeScript (React)  | the dealership UI; talks only to the gateway                                                  |

Each service owns its database, and no service reads another's. Services validate tokens with identity-api's public
keys (`/.well-known/openid-configuration`). The browser never holds a token: the gateway is the web app's backend (the
"backend for frontend" pattern). It signs the browser in at identity-api, keeps the tokens in a session of its own, gives
the browser only an httpOnly session cookie, and adds the access token to each request it sends on
(`docs/ARCHITECTURE.md`, "Signing in"). [Aspire](https://aspire.dev) runs all of it locally and shows logs, traces
and metrics for every service in one dashboard.

```
acme-dms/
  apphost/Acme.AppHost/   Aspire AppHost (C#): what runs, and how it is wired
  backend/
    identity-api/         .NET: Acme.Identity.{Service, BusinessLogic.Abstractions, BusinessLogic, DTO, Persistence}
    document-api/         .NET: Acme.Documents.{same layers}
    dealership-api/src/   NestJS, same layers: service/, business-logic-abstractions/, business-logic/, dto/, persistence/
    gateway-api/          .NET: Acme.Gateway.{Service, BusinessLogic.Abstractions, BusinessLogic, DTO, Persistence,
                          RestClients}: a YARP reverse proxy (routes in appsettings.json) that keeps the web app's sign-in
    service-defaults/     .NET platform code every .NET service uses (telemetry, auth, problem details, correlation)
  web/                    React single-page app (Vite)
  scripts/                helper scripts (see "Look around a running system")
```

## Setup

Once: open a terminal, get the code, run the setup script, check. The script installs everything Acme DMS needs and skips
anything you already have, so it is safe to run again.

### 1. Open a terminal

- **Windows:** press the Windows key, type **PowerShell**, right-click **Windows PowerShell** and choose **Run as
  administrator** (the setup installs Docker Desktop and WSL 2, which need it). Use this same window for steps 2 and 3.
- **macOS:** press Cmd+Space, type **Terminal**, press Enter.

### 2. Get the code

If you do not have Git yet (`git --version` says it is not found), install it first:

- **Windows:** `winget install --id Git.Git --exact`, then close the window and open a new administrator PowerShell
- **macOS:** `xcode-select --install`, and accept the dialog

Then clone the repository and go into it. This puts it in a folder called `acme-dms` in your home folder:

```bash
cd ~
git clone https://github.com/ZafarAli110/acme-dms.git
cd acme-dms
```

### 3. Run the setup

In the same terminal, inside the `acme-dms` folder:

- **Windows** (the administrator PowerShell). It opens in `C:\Windows\System32`, so first check you are in the
  `acme-dms` folder: `pwd` should end in `\acme-dms`. If the code is somewhere else, go there first, for example
  `cd D:\Work\acme-dms`. Then:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\setup.ps1
  ```
  It uses `winget` for fnm, the .NET SDK and Docker Desktop (installing WSL 2 first if it is missing), the official
  installers for Bun and the Aspire CLI, adds each to your `PATH`, and switches fnm on in your PowerShell profile. If
  it installed Docker Desktop or WSL 2, **restart Windows once**.
- **macOS** (Terminal):
  ```bash
  ./setup.sh
  ```
  It uses Homebrew (installing it first if needed) for fnm, the .NET SDK and Docker Desktop, the official installers
  for Bun and the Aspire CLI, and adds the `PATH` and fnm lines to `~/.zshrc` (or `~/.bash_profile` for bash). It may
  ask for your password.

What it installs:

| Tool                                                  | Version | Check              |
| ----------------------------------------------------- | ------- | ------------------ |
| Git                                                   | recent  | `git --version`    |
| GitHub CLI (`gh`)                                     | recent  | `gh --version`     |
| Node.js, through [fnm](https://github.com/Schniz/fnm) | 26      | `node -v`          |
| Bun                                                   | 1.4.4+  | `bun -v`           |
| .NET SDK (the SDK, not just the runtime)              | 10      | `dotnet --version` |
| Docker Desktop                                        | current | `docker info`      |
| Aspire CLI                                            | 13.6    | `aspire --version` |

**Node.js comes through fnm, so a Node you already have is not touched.** Inside this folder fnm switches to the Node in
`.nvmrc` (26, the current LTS) on its own; everywhere else you keep the version you had. The script checks this at
the end. `bun run dev` and `bun run gate:fast` refuse to start on any other Node and say how to install the right one.

### 4. Check

Open a **new** terminal (so it sees the new `PATH`; on Windows an ordinary PowerShell is fine from now on), go to the
folder with `cd ~/acme-dms`, and run the check commands from the table. The tests use Docker too: dealership-api's
tests run against a real Postgres that [Testcontainers](https://testcontainers.com) starts in Docker for each run.

### 5. Sign in to GitHub

Lab 10's agents open a pull request and comment on it with the GitHub CLI, so it needs your account. Once:

```bash
gh auth login   # GitHub.com, HTTPS, log in with a web browser
```

The same in PowerShell. A pull request needs a repository you can push to: on a clone of this one, lab 10's run
stops at the push. To go all the way, push your clone to a repository of your own and make that `origin`.

## Run it

**Start Docker Desktop first, and wait until it says it is running** (Windows: from the Start menu; macOS:
`open -a Docker`). `bun run dev` starts Postgres, RabbitMQ and the other containers in Docker; without it they never
start. Then, in a terminal:

```bash
cd ~/acme-dms
bun run dev          # = aspire run (Docker Desktop must be running)
```

The first run takes a few minutes: it builds the .NET projects and pulls the container images.

1. Open the **Dashboard** link the terminal prints (`http://localhost:15090/login?t=…`). The token in it logs you in.
2. Wait until every resource is **Running** and **Healthy**.
3. The **seed** resource loads the sample data once everything is up, then shows **Finished**. It runs on every start
   and reuses what is already there, so nothing is duplicated; `bun run seed` runs it by hand.
4. Open the **web** URL and sign in (the form is pre-filled with `sam`). The gateway is always at
   `http://localhost:5200`.
5. Press **Ctrl+C** in the first terminal to stop everything.

`bun run reset` puts the data back to the seeded state at any time (parts, stock, photos, customers and queues; users
are kept).

**Local credentials** (development only):

| What                 | Username        | Password   |
| -------------------- | --------------- | ---------- |
| Postgres             | `acme`          | `acme`     |
| RabbitMQ (UI + AMQP) | `acme`          | `acme`     |
| Demo users           | see table above | `Acme123!` |

One Postgres server holds every service's database, all with that login:

| Database     | Owned by       | Holds                                                                   |
| ------------ | -------------- | ----------------------------------------------------------------------- |
| `identity`   | identity-api   | dealers, locations, users and their roles, refresh tokens, signing keys |
| `dealership` | dealership-api | parts, bins, stock, photos, customers, and exports (lab 09-after on)    |
| `documents`  | document-api   | stored files, their variants, the outbox                                |
| `gateway`    | gateway-api    | the browsers' sign-in sessions: each one's tokens and its renewal lease |

Its address is the `postgres` resource in the dashboard. `bun run reset` leaves `identity` and `gateway` alone, so you
stay signed in.

**Swagger** (in development only): every service has Swagger UI at `/swagger` on its own URL. Click the service's URL in
the dashboard and add `/swagger`. Get a token with `POST /v1/tokens` on identity-api, then use **Authorize**.
dealership-api also needs the `x-location-id` header.

**identity-api's signing keys** are kept encrypted in its database, with ASP.NET Data Protection keys that live outside
it: in development, a folder in your user profile (`acme-dms/identity-api/data-protection-keys` under the local
application data folder: `~/Library/Application Support` on macOS, `%LOCALAPPDATA%` on Windows, `~/.local/share` on
Linux). Deleting that folder costs nothing worse than one renewal: identity-api replaces a signing key it can no longer
open.

## Look around a running system

The dashboard's **Traces** tab follows each request from the gateway through every service it touches.
**Structured** shows every log line with its correlation id and trace id.

From a second terminal (repo root, while `bun run dev` is running):

| Command                                             | What it shows                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `bun run status`                                    | every resource, its state and URL                                      |
| `bun run health`                                    | what is not healthy, its last log lines, and the likely fix            |
| `bun run start` / `bun run stop`                    | start the whole system in the background / stop it                     |
| `bun run rebuild identity-api`                      | rebuild one .NET service after a change (the rest reload themselves)   |
| `bun run resource dealership-api stop`              | stop one service (or `start`, `restart`): how the rest copes           |
| `bun run logs dealership-api`                       | console output of one service                                          |
| `bun run traces dealership-api`                     | recent traces of one service                                           |
| `bun run errors`                                    | only failed (5xx) traces, across all services                          |
| `bun run sql:explain "select …"`                    | how Postgres runs one query: its plan, rows and time (read-only)       |
| `bun run xlsx:inspect <file>`                       | an Excel file's sheets, row counts, header and first and last rows     |
| `bun run api as rita GET /api/identity/v1/users/me` | call the system as a demo user (see below)                             |
| `bun run seed`                                      | add the sample parts, stock, photos, customers                         |
| `bun run seed:bulk`                                 | add 1.6M customers at Northside, 400k at Riverside, 250k at Westgate   |
| `bun run reset`                                     | empty business data and queues, reset demo users' locations, then seed |

`bun run api` signs in as a demo user, starts at their default location (or the one given with `--location`), and
calls the gateway as a script does: with an access token of its own (`POST /api/identity/v1/tokens`), which the gateway
passes on unchanged. The web app sends a session cookie instead, and the gateway adds the same kind of token:

```bash
bun run api as maria --location riverside GET /api/dealership/v1/stock
bun run api as rita GET /api/dealership/v1/customers
bun run api as sam GET "/api/dealership/v1/parts?search=brake"
bun run api as maria POST /api/dealership/v1/parts '{"partNumber":"BRK-PAD-009","description":"Pads","unitPrice":45}'
bun run api as rita --lang fr POST /api/dealership/v1/customers '{"surname":""}'   # messages in French
```

## Everyday commands

Every project, in either language, has the same targets, run through [Nx](https://nx.dev).

| Command                           | What it does                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run dev`                     | Start everything under Aspire                                                              |
| `bun run typecheck`               | Type-check every project (TypeScript and .NET)                                             |
| `bun run lint`                    | Lint every project (oxlint, .NET analyzers)                                                |
| `bun run test`                    | Run every project's unit tests                                                             |
| `bun run coverage`                | Every project's tests with coverage: one table of lines run, reports in `coverage/`        |
| `bun run format`                  | Format TypeScript, JSON and Markdown                                                       |
| `bun run format:check`            | Check the formatting without changing any file (what CI runs)                              |
| `bun run gate:fast`               | Format check, lint, typecheck and tests for the projects changed since your branch started |
| `bun run docs:check`              | The docs still match the repository: every command listed, every path and link real        |
| `bun run gate:slow`               | End-to-end tests of the web app (Playwright, installed Chrome), against the running system |
| `bunx nx test @acme/identity-api` | One target for one project                                                                 |

| Target      | TypeScript        | .NET                                    |
| ----------- | ----------------- | --------------------------------------- |
| `format`    | `bun fmt --check` | `dotnet format whitespace`              |
| `lint`      | `oxlint`          | `dotnet build -warnaserror` (analyzers) |
| `typecheck` | `tsc` (TS 7)      | `dotnet build`                          |
| `test`      | Vitest            | MSTest + Moq                            |

**VS Code:** open the repository folder. It offers the extensions in `.vscode/extensions.json` (C# Dev Kit, oxlint, so
lint errors show as you type, EditorConfig, Bun, Playwright) and opens `AcmeDms.slnx`, so every C# project loads.

Every commit runs a quick check of the staged files first (`.githooks/pre-commit`, switched on by the setup script;
`bun run hooks` if you set up before it existed): formatting, oxlint with each project's import rules, and C#
whitespace. Then `.githooks/commit-msg` refuses a message whose first line is over 100 characters. CI runs every
check on `main`, every `lab/` branch and every pull request.

Every service, the gateway included, answers `GET /v1/system/health` in the same shape, which Aspire polls:

```json
{ "service": "dealership-api", "status": "ok", "version": "26.11.0", "databaseReachable": true }
```

`status` is `degraded` when the service cannot reach its database; the gateway's is its sessions database. The version
is set once, in the root `package.json`: .NET reads it through `Directory.Build.props`, and dealership-api's build
writes it in.

## Conventions

**Business handlers (every service).** One use case = one handler.

```
controller ──► handler interface (abstractions) ──► handler (business logic) ──► persistence
```

- One controller per resource, reads and writes apart (`PartController`, `PartCommandController`). Controllers are
  thin: each action reads the request, calls one handler, and returns its result.
- Handler interfaces live in _business-logic-abstractions_, implementations in _business-logic_. In NestJS each
  interface comes with a DI token, because Nest cannot inject interfaces (e.g. `GET_USER_CONTEXT_QUERY_HANDLER`).
- Names: verb first, `GetPartQueryHandler` for reads, `CreatePartCommandHandler` for writes, `I…` for the interface;
  one public method, `executeAsync` / `ExecuteAsync`. Anything asynchronous ends in `Async`.
- Layer rules are enforced: by project references in .NET, and by import rules in
  `backend/dealership-api/.oxlintrc.json` (for example, a controller may not import `persistence/`).

**Who is calling.** Every request except health checks needs a bearer token from identity-api; for the web app the
gateway adds it from the browser's session cookie. The selected location
travels in the `x-location-id` header, and services refuse locations the token does not grant. Handlers receive the
user context (user, dealer, location, permissions) explicitly. Code checks **permissions, never role names**.

**Routes.** Services use `/v1/<resource>`. The gateway adds the service prefix: `/api/dealership/v1/...`. A `201 Created`
carries `Location` relative to the service (`/v1/customers/{id}`), and the gateway adds its prefix back on the way
out. Every answer is `Cache-Control: no-store`: it is one dealer's data for one signed-in user.

**Errors.** Every error from every service is RFC 9457 problem details (`application/problem+json`) with the same
fields: `type` (`urn:acme:error:…`), `title`, `status`, `detail`, `instance`, `location`, `userId`, `traceId`,
`timestamp`. Paste the `traceId` into the dashboard's search to see the whole request.

**Correlation.** Send `x-correlation-id` to follow a request through the logs; without one, the trace id is used. It is
echoed in every response and attached to every log line.

**DTOs are contracts.** Every field is always present; a missing value is `null`, never left out.

**Style.**

- Private fields start with `_`; methods never do.
- Constructor injection assigns explicit backing fields (`this._x = x;`), in TypeScript and C# alike.
- Folders are named for what they hold. No `common`, `utils` or `helpers`.
- Tests: `__test__/` folders next to the code in TypeScript; `tests/` projects in .NET.

## Running outside development

Development needs none of this. Anywhere else, set:

| Setting                          | Service        | What it is                                                                                                                                                        |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataProtection__KeysPath`       | identity-api   | a folder outside its database, shared by every instance (in production, a key vault), for the keys that encrypt its signing keys. It refuses to start without one |
| `ForwardedHeaders__KnownProxies` | gateway-api    | the addresses of the load balancers in front of it, so the sign-in limit counts each person, not the balancer                                                     |
| `EXPORT_LINK_KEY`                | dealership-api | the key that signs export download links (lab 09-export-final and `final`); required unless `NODE_ENV` is unset, `development` or `test`                          |

Every service applies its own migrations as it starts. Only Development gets the demo dealers, users and data.
If identity-api ever cannot open the signing key in use (its Data Protection keys were lost), `docs/ARCHITECTURE.md`,
"A key no instance can open", gives the way out.

## Where to find what

| Path                                                                                  | What                                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`                                                                | services, layers, and how they fit together                                                          |
| `docs/standards/`                                                                     | the team's rules: handlers, errors, messaging, uploads, dealers and locations, database, web, coding |
| `docs/contracts.md`                                                                   | what services promise each other: the health response, RabbitMQ messages and queues                  |
| [Acme Tracker](https://github.com/ZafarAli110/acme-tracker)                           | the backlog: a separate repository, at http://localhost:4100 when it is running                      |
| `CLAUDE.md`, `.claude/`, `.mcp.json`                                                  | the Claude Code harness (lab branches and `final`, see [Branches](#branches))                        |
| [docs/HARNESS.md](https://github.com/ZafarAli110/acme-dms/blob/final/docs/HARNESS.md) | every piece of the harness, when it runs and the lab that added it (lab 10 and `final`)              |
| `docs/evidence/`, `docs/qa/`, `docs/lessons/`                                         | what `/verify-ticket`, `/qa-ticket` and `/write-retro` write (from labs 07, 09)                      |
| [docs/plans/](https://github.com/ZafarAli110/acme-dms/tree/final/docs/plans)          | design plans and the state-machine sweep's findings (`final`)                                        |
| `.github/workflows/ci.yml`                                                            | CI: format, lint, typecheck and test on every pull request                                           |

## Troubleshooting

| Problem                                         | Fix                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aspire: command not found`                     | Open a new terminal. If you installed it with `dotnet tool install -g Aspire.Cli`, add `~/.dotnet/tools` (macOS) or `%USERPROFILE%\.dotnet\tools` (Windows) to `PATH`. The .NET build needs it too.                                                                                                                                                                                                          |
| `You must install .NET to run this application` | .NET is in a non-standard place (e.g. `brew install dotnet`). Set `DOTNET_ROOT`, e.g. `export DOTNET_ROOT=/opt/homebrew/opt/dotnet/libexec`, or use the official installer.                                                                                                                                                                                                                                  |
| Containers never start                          | Start Docker Desktop and wait until it says it is running (`docker info` answers).                                                                                                                                                                                                                                                                                                                           |
| `password authentication failed` for Postgres   | An old data volume has a different password. Stop the app, remove the volume (`docker volume ls`, then `docker volume rm <name>`), and start again.                                                                                                                                                                                                                                                          |
| A .NET change does not show up                  | Restarting a resource does not rebuild it. Run `dotnet build` on that project, then restart it in the dashboard, or stop and run `bun run dev` again. TypeScript services rebuild on save.                                                                                                                                                                                                                   |
| Signing in says "Too many requests"             | identity-api allows 10 sign-ins a minute from one address. Running the whole end-to-end suite signs in more often than that from your machine: wait a minute and run the failed tests again (`--last-failed`).                                                                                                                                                                                               |
| Signing in answers 503                          | The gateway cannot reach identity-api: check it is Healthy (`bun run health`). A signed-in person keeps working while their token lasts.                                                                                                                                                                                                                                                                     |
| `bun run seed` says it cannot find the gateway  | Start the system first (`bun run dev`) and wait until everything is Healthy.                                                                                                                                                                                                                                                                                                                                 |
| `bun run dev` says packages are not installed   | You switched to a branch that adds a package (lab 09-after does). Run `bun install`, then start again.                                                                                                                                                                                                                                                                                                       |
| A photo stays `pending`, or times out           | Check `bun run errors` and the RabbitMQ UI (the `rabbitmq` URL in the dashboard, user `acme`/`acme`): a message in a `*.dlq` queue tells you which consumer gave up and why. After 10 minutes the photo is marked timed out: remove it and add it again.                                                                                                                                                     |
| A warning about messages in a dead-letter queue | Read why they failed in the RabbitMQ UI and fix that. Then send them back: dealership-api: in `backend/dealership-api`, `RABBITMQ_URL=<amqp address> bun run replay:dead-letters` (PowerShell: `$env:RABBITMQ_URL = "<amqp address>"; bun run replay:dead-letters`), the address being the `rabbitmq` connection string in the dashboard; document-api: run it once with the argument `replay-dead-letters`. |
| A resource is Unhealthy, or keeps restarting    | `bun run health`: it names the resource, prints its last log lines and, for a known cause, the fix. The same lines are on the dashboard: click the resource, then **Console logs**.                                                                                                                                                                                                                          |
| `bun add` finds no version old enough           | The version you asked for is less than 7 days old (`minimumReleaseAge` in `bunfig.toml`). Take the one before it. For a security fix, list the package in `minimumReleaseAgeExcludes` in the same commit and say why.                                                                                                                                                                                        |
| Port already in use                             | Another `aspire run` is still running: `aspire stop`, or close the other terminal.                                                                                                                                                                                                                                                                                                                           |

## Licence

MIT. See [LICENSE](LICENSE).
