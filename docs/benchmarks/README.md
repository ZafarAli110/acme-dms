# Benchmarks: the busy morning

How many requests a second Acme answers well, how that was measured, and how far it is from where it must go. Every
number here was measured unless it says **projected**.

## Target and where we are

|                                            | Requests a second                | p95          | Status                                 |
| ------------------------------------------ | -------------------------------- | ------------ | -------------------------------------- |
| ACME-117's busy morning                    | 3,300                            | about 300 ms | the ticket's figure                    |
| **Target**                                 | **20,000 to 100,000**            | under 300 ms | set by Zafar Ali, 9 Nov 2026           |
| **Measured now**, one laptop               | **800**, every request answered  | 42 to 82 ms  | the laptop's ceiling, not the system's |
| Measured now, one laptop                   | 1,000, 29,998 of 30,000 answered | 1.9 s        | past the laptop's ceiling              |
| **Projected**, one 16-core database server | about 3,300 to 4,000             | under 300 ms | from CPU per request; not yet run      |

The laptop runs everything at once (Postgres, four API copies, the gateway, Aspire and the load test itself) on four
performance and six efficiency cores, so it stops near 1,000 a second whatever the code does. Proving 3,300 a second, and
anything beyond, needs a database on its own machine and the load sent from another.

## What a request costs (measured, 800 a second, 9 Nov 2026 23:00)

| Part                            | CPU per request   | At 800/s                 |
| ------------------------------- | ----------------- | ------------------------ |
| Postgres                        | about 1.8 ms      | 141% of a core           |
| dealership-api (4 copies, Node) | about 1.5 ms      | about 30% of a core each |
| gateway-api (.NET)              | about 0.8 to 1 ms | 60 to 85% of a core      |
| **All of it**                   | **about 4 ms**    |                          |

From the traces (`bun run trace-breakdown`): a typical request takes 7 ms end to end (session read 1, gateway to API
under 1, API code 1, SQL 2.7, about 5 statements); p95 32 ms, p99 61 ms.

## Through the web server's HTTPS (ACME-130, 10 Nov 2026)

The figures above, and every earlier one, send straight to the gateway, as a load balancer would. Since ACME-130 a
browser on a developer's machine comes in through the web server's HTTPS. `bun run load-test --through-web` measures
that way in; the two are written side by side, never mixed. Every run of the day at 800 a second for 30 s, on mains
power, by the author and the verifier; each answered all 24,000:

| Way in                                                      | Runs | p95 of each run, ms               | p99 of each run, ms        | Postgres (average) |
| ----------------------------------------------------------- | ---- | --------------------------------- | -------------------------- | ------------------ |
| Straight to the gateway (as before)                         | 4    | 37, 40, 49, 67                    | 101–162                    | 134–185%           |
| The web server's HTTPS, behind Aspire's proxy (first build) | 7    | 29, 31, 37, 48, **240, 316, 758** | 43–88, **845, 670, 1,562** | 134–174%           |
| The web server's HTTPS, its own port (now)                  | 5    | 37, 43, 49, 53, 71                | 83–147                     | 147–175%           |

Three runs in seven through Aspire's proxy waited seconds at the tail, with the client's connections piling up past
its 512; none of the five without it did, and those sit in the gateway's own band. So `start:prod` now serves the web
app on its own port (5100) with no proxy in front, as it already did the .NET services and dealership-api, for the
same reason (AppHost.cs). What HTTPS itself costs is within the laptop's run-to-run swing: not a number to quote from
one machine. Not in the table: the web server's own CPU (TLS, its hop to the gateway) is not in the load watcher's
table; Bun's client speaks HTTP/1.1 to it (its HTTP/2 client is experimental), where a browser uses HTTP/2. Against 9
Nov (p95 42 ms, Postgres 141%) the gateway's runs sit either side: ACME-130 changes nothing Postgres or the gateway is
asked.

## Projections from that cost

At 4 ms of CPU a request, with servers kept at half their CPU so a spike has room:

| Requests a second | Cores busy | 4-vCPU servers at 50% |
| ----------------- | ---------- | --------------------- |
| 3,300             | about 14   | about 7               |
| 20,000            | about 80   | about 40              |
| 100,000           | about 400  | about 200             |

The 20,000 to 100,000 target is not reached by more of the same servers alone. What changes the cost per request:

1. **Reads that never reach Postgres**: a shared cache (Redis) for totals, recent customers, part details, cleared by the
   outbox's events; HTTP caching (ETags, ACME-121) at the edge.
2. **Search out of the main database**: a read replica for searches first (no sync code), a search engine later if
   needed. Searches are about half of Postgres's work.
3. **Sessions without a database read**: the gateway reads the session on every request; Redis, or short-lived signed
   tokens checked locally.
4. **Dealers split across databases**: each dealer's data on one shard, a routing table saying which.
5. **The API's own cost**: OpenTelemetry is about a quarter of the API's CPU, Temporal's polyfill under Node a little
   more; profile before and after each change.

## History (one laptop, same load mix)

`bun run start:prod --load-test`, 4 dealership-api copies, 30 s after a 10 s warm-up, the large sample data (Northside
1.6 million customers).

| When        | Change                                                                           | Clean rate                                  | p95            | Postgres CPU  |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------- | ------------- |
| 9 Nov 16:00 | before ACME-129                                                                  | 200/s (at 400/s only 108 answered a second) | 97 ms at 200/s | 408% at 200/s |
| 9 Nov 19:00 | ACME-129: cheap totals, keyset pages, search paths, Postgres 2 GB                | 800/s                                       | 166 ms         | 341%          |
| 9 Nov 22:30 | parts search, close names as owner, list columns, one trace in ten, gateway pool | 800/s                                       | 82 ms          | 213%          |
| 9 Nov 23:00 | exact names first (D14)                                                          | 800/s                                       | 42 ms          | 141%          |

Above 1,000 a second on macOS the gateway's process dies when its listen queue overflows (a .NET-on-macOS fault): the
load test keeps at most 512 connections, and 1,200 a second is not a valid run here.

## How to measure

```bash
bun run start:prod --load-test                              # 4 dealership-api copies; DEALERSHIP_API_INSTANCES=<n> for another count
bun run sql:top --reset                                     # count the database's statements afresh
bun run load-test --rate 800 --seconds 30                   # one rate per run
bun run sql:top                                             # which statements took the database's time
bun run trace-breakdown --seconds 60                        # where requests waited, from the traces
```

- **On mains power, with little else running.** On battery, macOS slows every core; a laptop that is swapping stalls
  every process at once (seen as `pg-pool.connect` waits in `trace-breakdown`). Either makes runs incomparable.
- **Run each rate at least twice:** the first after a restart reads a cold database.
- **Compare CPU per request, not only p95:** the tail on a shared laptop moves with whatever else runs.
- `start:prod --load-test` keeps one request's trace in ten, as production would; the per-address limits are lifted,
  because the test comes from one address.
