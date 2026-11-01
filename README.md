# Acme DMS

Dealership management system: parts, stock, customers and documents for dealer groups.

## Services

| Service          | Stack   |
| ---------------- | ------- |
| `identity-api`   | .NET 10 |
| `dealership-api` | NestJS  |
| `document-api`   | .NET 10 |
| `gateway`        | YARP    |
| `web`            | React   |

Postgres and RabbitMQ run in Docker. Aspire runs everything locally.

## Getting started

Prerequisites: Git, Node.js 26, Bun, .NET 10 SDK, Docker Desktop, Aspire CLI. `./setup.sh` (macOS) or `.\setup.ps1`
(Windows, as administrator) installs them.

```bash
bun install
bun run dev      # Docker Desktop must be running; open the dashboard link it prints
bun run seed     # sample data, once
```

Sign in to the web app as `sam@northwind.test` / `Acme123!` (Northwind Motors). `tom@citymotors.test`, same password,
works for another dealer, City Motors.

## Commands

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `bun run dev`       | Start everything                |
| `bun run test`      | Unit tests                      |
| `bun run lint`      | Lint                            |
| `bun run typecheck` | Type-check                      |
| `bun run format`    | Format                          |
| `bun run gate:fast` | What CI checks, on changed code |

## Licence

MIT. See [LICENSE](LICENSE).
