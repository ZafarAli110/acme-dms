# Acme DMS

Dealership management system: parts, stock, customers and documents for dealer groups. One deployment serves several
dealers from the same databases; each dealer has one or more locations ("rooftops").

| Dealer           | Locations                      |
| ---------------- | ------------------------------ |
| Northwind Motors | Northside, Riverside, Westgate |
| City Motors      | Central                        |

## Services

| Service          | Stack   |
| ---------------- | ------- |
| `identity-api`   | .NET 10 |
| `dealership-api` | NestJS  |
| `document-api`   | .NET 10 |
| `gateway-api`    | YARP    |
| `web`            | React   |

Postgres and RabbitMQ run in Docker. Aspire runs everything locally.

## Getting started

Prerequisites: Git, the GitHub CLI, Node.js 26 (`bun run dev` checks it), Bun, .NET 10 SDK, Docker Desktop, Aspire CLI.
`./setup.sh` (macOS) or `.\setup.ps1` (Windows, as administrator) installs them.
For lab 10's pull requests, once: `gh auth login`.

```bash
bun install
bun run dev      # Docker Desktop must be running; open the dashboard link it prints
                 # the seed resource loads the sample data on every start
```

Demo users, all with the password `Acme123!`:

| User                   | Dealer           | Location(s) and role                              |
| ---------------------- | ---------------- | ------------------------------------------------- |
| `sam@northwind.test`   | Northwind Motors | Northside + Riverside: Service Advisor            |
| `rita@northwind.test`  | Northwind Motors | Riverside + Westgate: Service Advisor             |
| `maria@northwind.test` | Northwind Motors | Northside + Riverside + Westgate: Service Manager |
| `tom@citymotors.test`  | City Motors      | Central: Service Manager                          |

## Commands

| Command                         | What it does                      |
| ------------------------------- | --------------------------------- |
| `bun run dev`                   | Start everything                  |
| `bun run start`                 | Start everything, in background   |
| `bun run stop`                  | Stop it                           |
| `bun run status`                | Every service, its state and URL  |
| `bun run logs dealership-api`   | One service's console output      |
| `bun run traces dealership-api` | One service's recent traces       |
| `bun run rebuild`               | Rebuild one .NET service          |
| `bun run resource`              | Stop or start one service         |
| `bun run reset`                 | Back to the sample data           |
| `bun run seed`                  | Add the sample data               |
| `bun run seed:bulk`             | Add 1.6M customers, for big lists |
| `bun run api`                   | Call the API as a demo user       |
| `bun run errors`                | Recent failed requests (traces)   |
| `bun run health`                | What is unhealthy, and why        |
| `bun run sql:explain`           | A query's plan (read-only)        |
| `bun run test`                  | Unit tests                        |
| `bun run coverage`              | Tests with coverage, per project  |
| `bun run lint`                  | Lint                              |
| `bun run typecheck`             | Type-check                        |
| `bun run format`                | Format                            |
| `bun run format:check`          | Check formatting only             |
| `bun run gate:fast`             | What CI checks, on changed code   |
| `bun run gate:slow`             | End-to-end tests of the web app   |
| `bun run docs:check`            | Docs still match the repository   |
| `bun run hooks`                 | Turn on the pre-commit check      |

## Licence

MIT. See [LICENSE](LICENSE).
