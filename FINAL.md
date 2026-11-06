# Acme DMS, finished

**Branch:** `final` · built on `lab/10-ticket-to-pr` (the whole harness) and `lab/09-export-final` (exports on a job
queue, with the export panel fixed)

This is not a lab. It is where every Acme ticket ends up built, each one by the harness itself: `/ticket-to-pr` from
the board to a reviewed pull request, then `/qa-ticket`, then a person merges into `final`.

## The tickets

| Ticket   | What                                                        | Status                                                       |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| ACME-101 | Find the customer's car by its plate or VIN                 | built                                                        |
| ACME-102 | Check-in photos of the customer's car                       | to build                                                     |
| ACME-103 | Log a call or visit with a customer                         | to build                                                     |
| ACME-104 | Is the part in stock? (customer on the phone)               | to build                                                     |
| ACME-105 | Customers due a service call-back                           | to build                                                     |
| ACME-106 | "Recently contacted" shows customers from another location  | to build                                                     |
| ACME-107 | Add a new part, with its photos, on its own page            | to build                                                     |
| ACME-108 | Export the customer list to Excel                           | built: a job queue and a separate worker                     |
| ACME-109 | Two people edit the same customer and one change disappears | built by hand: a version as ETag, If-Match, 412 / 428, 304   |
| ACME-110 | The customer list stays quick at our biggest location       | to build: indexes that fit the list's queries                |
| ACME-111 | A change in one service never breaks another unnoticed      | to build: a written contract both sides test against         |
| ACME-112 | One way of writing the rules for what a request may contain | to build: Valibot through Nest 12's Standard Schema pipe     |
| ACME-113 | An export can be downloaded whichever server answers        | to build: export files on shared storage (`@nestjs/storage`) |
| ACME-114 | Messages from the server in the user's language             | built by hand: `@nestjs/i18n`, English and French            |

## Build the next one

1. `git switch final`, `git pull`, `bun install`, `bun run reset`, then `bun run dev`. The tracker running.
2. In Claude: `/clear`, `/show-meter reset`, then `/ticket-to-pr ACME-1xx`. Answer its questions on the ticket.
3. When the pull request is reviewed and `/qa-ticket` passes, merge it into `final` and mark the ticket built above.
