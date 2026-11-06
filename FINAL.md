# Acme DMS, finished

**Branch:** `final` · built on `lab/10-ticket-to-pr` (the whole harness) and `lab/09-export-final` (exports on a job
queue, with the export panel fixed)

This is not a lab. It is where every Acme ticket ends up built, each one by the harness itself: `/ticket-to-pr` from
the board to a reviewed pull request, then `/qa-ticket`, then a person merges into `final`.

## The tickets

| Ticket   | What                                                        | Status                                   |
| -------- | ----------------------------------------------------------- | ---------------------------------------- |
| ACME-101 | Find the customer's car by its plate or VIN                 | built                                    |
| ACME-102 | Check-in photos of the customer's car                       | to build                                 |
| ACME-103 | Log a call or visit with a customer                         | to build                                 |
| ACME-104 | Is the part in stock? (customer on the phone)               | to build                                 |
| ACME-105 | Customers due a service call-back                           | to build                                 |
| ACME-106 | "Recently contacted" shows customers from another location  | to build                                 |
| ACME-107 | Add a new part, with its photos, on its own page            | to build                                 |
| ACME-108 | Export the customer list to Excel                           | built: a job queue and a separate worker |
| ACME-109 | Two people edit the same customer and one change disappears | to build: a row version, 409 when stale  |

## Build the next one

1. `git switch final`, `git pull`, `bun install`, `bun run reset`, then `bun run dev`. The tracker running.
2. In Claude: `/clear`, `/show-meter reset`, then `/ticket-to-pr ACME-1xx`. Answer its questions on the ticket.
3. When the pull request is reviewed and `/qa-ticket` passes, merge it into `final` and mark the ticket built above.
