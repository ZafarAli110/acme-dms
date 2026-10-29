# Acme DMS

A small dealership management system (DMS) used for hands-on agentic engineering workshops. It is deliberately
realistic: three services in two languages behind a gateway, a message broker, multi-tenancy, a layered architecture
and real conventions.

- [The business](#the-business)
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Run it](#run-it)
- [Look around a running system](#look-around-a-running-system)
- [Everyday commands](#everyday-commands)
- [Conventions](#conventions)
- [Where to find what](#where-to-find-what)
- [Troubleshooting](#troubleshooting)

## The business

**Acme** sells this DMS to dealer groups. Each **dealer** is a client with one or more **locations**: physical
dealership sites, often called "rooftops" in the motor trade. Each deployment of Acme DMS serves one client, with its
own databases; this one is **Northwind Motors**. Within the client, some data is shared by all its locations (the part
master records) and some belongs to one location (each part's inventory and bin, customers, vehicles, appointments,
documents).

People hold a **role per location**, and roles grant **permissions** (`parts.write`, `stock.adjust`, ...).

| Dealer           | Locations            |
| ---------------- | -------------------- |
| Northwind Motors | Northside, Riverside |

Demo users, all with the password **`Acme123!`**:

| User                   | Dealer           | Location(s) and role                   |
| ---------------------- | ---------------- | -------------------------------------- |
| `sam@northwind.test`   | Northwind Motors | Northside: Service Advisor             |
| `rita@northwind.test`  | Northwind Motors | Riverside: Service Advisor             |
| `maria@northwind.test` | Northwind Motors | Northside + Riverside: Service Manager |

Maria assigns people to locations on the **Locations** page; a change shows after that person's next sign-in.
`bun run reset` puts everyone back on the locations above.

## What it does

| Area                         | API (through the gateway)                                                                     | Web                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sign-in                      | `POST /api/identity/v1/tokens`, `GET /api/identity/v1/users/me`                               | sign-in page, location switcher                        |
| Parts (stocked per location) | `GET/POST /api/dealership/v1/parts`, `GET/PATCH /api/dealership/v1/parts/{id}`                | list, search, create (with bin), edit page             |
| Bins (per location)          | `GET/POST /api/dealership/v1/bins`                                                            | bin picker when creating a part                        |
| Part photos                  | saved with the part (`PATCH …/parts/{id}`, multipart); `POST …/parts/{id}/photos` adds one    | on the edit page: add, remove, default; processing     |
| Stock (per location)         | `GET /api/dealership/v1/stock`, `PUT /api/dealership/v1/stock/{partId}`                       | — (ticket ACME-101)                                    |
| Customers (per location)     | `GET/POST /api/dealership/v1/customers`, `GET/PUT …/customers/{id}`, `GET …/customers/recent` | list, search, create, edit, recently contacted on Home |
| Documents                    | `POST /api/documents/v1/documents`, `GET …/{id}`, `GET …/{id}/content/{variant}`              | images via `DocumentImage`                             |
| Who am I                     | `GET /api/dealership/v1/system/user-context`                                                  | —                                                      |

A part photo travels: dealership-api → document-api (stored, 202) → outbox → RabbitMQ → document-api's processor
(WebP `display` and `thumb` variants) → `document.processed.v1` → dealership-api marks the photo ready. A file that
cannot be processed is retried three times, then marked failed and dead-lettered.

## Architecture

```
                         ┌─► identity-api (.NET)     ── Postgres: identity
web (React) ──► gateway ─┼─► dealership-api (NestJS) ── Postgres: dealership
                (YARP)   └─► document-api (.NET)     ── Postgres: documents
                                   │     ▲
                                   └HTTP─┘   events via RabbitMQ
```

| Service          | Language            | Owns                                                            |
| ---------------- | ------------------- | --------------------------------------------------------------- |
| `identity-api`   | C# (.NET 10)        | dealers, locations, users, roles; issues access tokens (JWT)    |
| `dealership-api` | TypeScript (NestJS) | parts catalogue, stock and other dealership data                |
| `document-api`   | C# (.NET 10)        | photos and files, image processing                              |
| `gateway`        | C# (YARP)           | the only entry point: `/api/<service>/...` goes to that service |
| `web`            | TypeScript (React)  | the dealership UI; talks only to the gateway                    |

Each service owns its database, and no service reads another's. Services validate tokens with identity-api's public
keys (`/.well-known/openid-configuration`). [Aspire](https://aspire.dev) runs all of it locally and shows logs, traces
and metrics for every service in one dashboard.

```
acme-dms/
  apphost/Acme.AppHost/   Aspire AppHost (C#): what runs, and how it is wired
  backend/
    identity-api/         .NET: Acme.Identity.{Service, BusinessLogic.Abstractions, BusinessLogic, DTO, Persistence}
    document-api/         .NET: Acme.Documents.{same layers}
    dealership-api/src/   NestJS, same layers: service/, business-logic-abstractions/, business-logic/, dto/, persistence/
    gateway/              .NET: Acme.Gateway, a YARP reverse proxy (routes in appsettings.json)
    service-defaults/     .NET platform code every .NET service uses (telemetry, auth, problem details, correlation)
  web/                    React single-page app (Vite)
  scripts/                helper scripts (see "Look around a running system")
```

## Prerequisites

Install these once. Each has a check command; run it in a **new** terminal after installing.

| Tool                                           | Version | Check                          |
| ---------------------------------------------- | ------- | ------------------------------ |
| Git                                            | recent  | `git --version`                |
| Node.js                                        | 26      | `node -v`                      |
| Bun                                            | 1.4.4+  | `bun -v`                       |
| .NET SDK (the SDK, not just the runtime)       | 10      | `dotnet --version`             |
| Podman Desktop (recommended) or Docker Desktop | current | `podman info` or `docker info` |
| Aspire CLI                                     | 13.6    | `aspire --version`             |

### Windows (PowerShell)

```powershell
winget install --id Git.Git
winget install --id OpenJS.NodeJS
powershell -c "irm bun.sh/install.ps1 | iex"
winget install --id Microsoft.DotNet.SDK.10
winget install --id RedHat.Podman-Desktop
irm https://aspire.dev/install.ps1 | iex
```

Then set up Podman and tell Aspire to use it (once), and open a new terminal:

```powershell
podman machine init
podman machine start
[Environment]::SetEnvironmentVariable("ASPIRE_CONTAINER_RUNTIME", "podman", "User")
```

### macOS (zsh)

```bash
brew install git node bun
brew install --cask dotnet-sdk
brew install podman
curl -sSL https://aspire.dev/install.sh | bash
podman machine init --cpus 4 --memory 8192
podman machine start
echo 'export ASPIRE_CONTAINER_RUNTIME=podman' >> ~/.zshrc && source ~/.zshrc
```

> Using Docker Desktop instead? Skip the Podman steps, do not set `ASPIRE_CONTAINER_RUNTIME`, and make sure Docker
> Desktop is running.

**The tests use the same container runtime.** dealership-api's tests run against a real Postgres that
[Testcontainers](https://testcontainers.com) starts for each test run. Docker Desktop works as it is. With Podman,
point Testcontainers at Podman's socket and turn off its cleanup container (once, in your shell profile):

```bash
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
export TESTCONTAINERS_RYUK_DISABLED=true
```

On Windows (PowerShell), with Podman: `[Environment]::SetEnvironmentVariable("TESTCONTAINERS_RYUK_DISABLED", "true", "User")`;
Podman Desktop's Docker compatibility (Settings → Docker Compatibility) provides the socket.

## Run it

```bash
git clone <repo-url> acme-dms
cd acme-dms
bun install          # TypeScript dependencies for every project
bun run dev          # = aspire run
```

The first run takes a few minutes: it builds the .NET projects and pulls the container images.

1. Open the **Dashboard** link the terminal prints (`http://localhost:15090/login?t=…`). The token in it logs you in.
2. Wait until every resource is **Running** and **Healthy**.
3. In a second terminal, load the sample data (once; it survives restarts):
   ```bash
   bun run seed
   ```
4. Open the **web** URL and sign in (the form is pre-filled with `sam`). The gateway is always at
   `http://localhost:5200`.
5. Press **Ctrl+C** in the first terminal to stop everything.

**Ran Acme DMS before 29 October 2026?** dealership-api then used TypeORM, and its database must be recreated once: run
`bun run reset`, then restart `dealership-api` in the dashboard (it says so in its log if you forget).

`bun run reset` puts the data back to the seeded state at any time (parts, stock, photos, customers and queues; users
are kept).

**Local credentials** (development only):

| What                 | Username        | Password   |
| -------------------- | --------------- | ---------- |
| Postgres             | `acme`          | `acme`     |
| RabbitMQ (UI + AMQP) | `acme`          | `acme`     |
| Demo users           | see table above | `Acme123!` |

**Swagger:** every service has Swagger UI at `/swagger` on its own URL. Click the service's URL in the dashboard and
add `/swagger`. Get a token with `POST /v1/tokens` on identity-api, then use **Authorize**. dealership-api also needs
the `x-location-id` header.

## Look around a running system

The dashboard's **Traces** tab follows each request from the gateway through every service it touches.
**Structured** shows every log line with its correlation id and trace id.

From a second terminal (repo root, while `bun run dev` is running):

| Command                                            | What it shows                                  |
| -------------------------------------------------- | ---------------------------------------------- |
| `bun run status`                                   | every resource, its state and URL              |
| `bun run logs dealership-api`                      | console output of one service                  |
| `bun run traces dealership-api`                    | recent traces of one service                   |
| `bun run errors`                                   | only failed (5xx) traces, across all services  |
| `bun run api as rita GET /api/identity/v1/users/me` | call the system as a demo user (see below)    |
| `bun run seed`                                     | add the sample parts, stock, photos, customers |
| `bun run reset`                                    | empty business data and queues, reset demo users' locations, then seed |

`bun run api` signs in as a demo user, picks their first location (or the one given with `--location`), and calls the
gateway exactly as the web app does:

```bash
bun run api as maria --location riverside GET /api/dealership/v1/stock
bun run api as rita GET /api/dealership/v1/customers
bun run api as sam GET "/api/dealership/v1/parts?search=brake"
bun run api as maria POST /api/dealership/v1/parts '{"partNumber":"BRK-PAD-009","description":"Pads","unitPrice":45}'
```

## Everyday commands

Every project, in either language, has the same targets, run through [Nx](https://nx.dev).

| Command                           | What it does                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run dev`                     | Start everything under Aspire                                                              |
| `bun run typecheck`               | Type-check every project (TypeScript and .NET)                                             |
| `bun run lint`                    | Lint every project (oxlint, .NET analyzers)                                                |
| `bun run test`                    | Run every project's unit tests                                                             |
| `bun run format`                  | Format TypeScript, JSON and Markdown                                                       |
| `bun run gate:fast`               | Format check, lint, typecheck and tests for changed projects                               |
| `bun run gate:slow`               | End-to-end tests of the web app (Playwright, installed Chrome), against the running system |
| `bunx nx test @acme/identity-api` | One target for one project                                                                 |

| Target      | TypeScript        | .NET                                    |
| ----------- | ----------------- | --------------------------------------- |
| `format`    | `bun fmt --check` | `dotnet format --verify-no-changes`     |
| `lint`      | `oxlint`          | `dotnet build -warnaserror` (analyzers) |
| `typecheck` | `tsc` (TS 7)      | `dotnet build`                          |
| `test`      | Vitest            | MSTest + Moq                            |

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

**Who is calling.** Every request except health checks needs a bearer token from identity-api. The selected location
travels in the `x-location-id` header, and services refuse locations the token does not grant. Handlers receive the
user context (user, dealer, location, permissions) explicitly. Code checks **permissions, never role names**.

**Routes.** Services use `/v1/<resource>`. The gateway adds the service prefix: `/api/dealership/v1/...`.

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

## Where to find what

| Path                       | What                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `docs/ARCHITECTURE.md`     | services, layers, and how they fit together                                                          |
| `docs/standards/`          | the team's rules: handlers, errors, messaging, uploads, dealers and locations, database, web, coding |
| `contracts/README.md`      | RabbitMQ messages and queues                                                                         |
| Acme Tracker               | the backlog: a separate tool, at http://localhost:4100 when it is running                            |
| `.github/workflows/ci.yml` | CI: format, lint, typecheck and test on every pull request                                           |

## Troubleshooting

| Problem                                         | Fix                                                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aspire: command not found`                     | Open a new terminal. If you installed it with `dotnet tool install -g Aspire.Cli`, add `~/.dotnet/tools` (macOS) or `%USERPROFILE%\.dotnet\tools` (Windows) to `PATH`. The .NET build needs it too. |
| `You must install .NET to run this application` | .NET is in a non-standard place (e.g. `brew install dotnet`). Set `DOTNET_ROOT`, e.g. `export DOTNET_ROOT=/opt/homebrew/opt/dotnet/libexec`, or use the official installer.                         |
| Containers never start                          | Start Podman (`podman machine start`) or Docker Desktop. With Podman, check `ASPIRE_CONTAINER_RUNTIME=podman`.                                                                                      |
| `password authentication failed` for Postgres   | An old data volume has a different password. Stop the app, remove the volume (`podman volume ls`, then `podman volume rm <name>`, or the same with `docker`), and start again.                      |
| A .NET change does not show up                  | Restarting a resource does not rebuild it. Run `dotnet build` on that project, then restart it in the dashboard, or stop and run `bun run dev` again. TypeScript services rebuild on save.          |
| `bun run seed` says it cannot find the gateway  | Start the system first (`bun run dev`) and wait until everything is Healthy.                                                                                                                        |
| A photo stays `pending`                         | Check `bun run errors` and the RabbitMQ UI (the `rabbitmq` URL in the dashboard, user `acme`/`acme`): a message in a `*.dlq` queue tells you which consumer gave up and why.                        |
| Port already in use                             | Another `aspire run` is still running: `aspire stop`, or close the other terminal.                                                                                                                  |

## Licence

MIT. See [LICENSE](LICENSE).
