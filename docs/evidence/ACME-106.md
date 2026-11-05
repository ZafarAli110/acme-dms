# ACME-106: "Recently contacted" shows customers from another location

Verified 2026-11-05 on branch ACME-106 at 4760884.

`A=/api/dealership/v1/customers` (the gateway prefix). Run `bun run reset` first; every command is
`bun run api as <user> [--location <x>] GET <path>` (add `--body` before `GET` to pipe the JSON).

| Requirement                                          | Command                                                                              | Expected                                          | Got                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Only the selected location's customers, newest first | `as maria --location riverside GET $A/recent`, compared with `GET "$A?pageSize=100"` | every id is in Riverside's list; dates descending | Adeyemi 10-26, Doyle 10-23, Byrne 10-18, Nowak 10-11, Fischer 04-02; 0 ids missing from the list (7 customers)          |
| Same for sam, and none on Maria's list               | `as sam GET $A/recent`, compared with his list and with Maria's                      | all in Northside's list; overlap with Maria 0     | Patel, McKenzie, Okafor, Whitaker, Hopper; 0 missing from the list (10); overlap 0                                      |
| Another location again                               | `as rita --location westgate GET $A/recent`                                          | only Westgate customers                           | Lindqvist, Hussain, Ashworth, Mensah, Demir; 0 missing from the list (6)                                                |
| Every listed customer opens                          | `as <user> [--location x] GET $A/<id>` for each recent id                            | 200 each                                          | maria 5/5, sam 5/5, rita 5/5, tom 2/2: all 200                                                                          |
| Another dealer sees none of Northwind's              | `as tom GET $A/recent`                                                               | only City Motors customers                        | Farooq 10-28, Ahmed 10-22; 0 missing from his list (3)                                                                  |
| Northwind ids are "not found" for tom                | `as tom GET $A/<sam's first recent id>` and `<maria's first recent id>`              | 404                                               | 404 and 404                                                                                                             |
| Another location's id is "not found"                 | `as rita --location westgate GET $A/<sam's id>`; `as sam GET $A/<maria's id>`        | 404                                               | 404 and 404                                                                                                             |
| The same mistake cannot slip through unnoticed (A)   | `bunx nx test @acme/dealership-api`                                                  | 6 tests; they fail on the old handler             | On the old handler 5 of 6 failed (Riverside's and City Motors' customers returned); on the new one all tests pass       |
| No location selected is refused                      | unit test "is refused when no location is selected"                                  | `BadRequestException`                             | passes                                                                                                                  |
| `bun run errors` shows nothing new                   | `bun run errors`                                                                     | no new failures                                   | one trace, `PUT /api/dealership/*` at 17:05:04, during startup seeding, before the first check; not looked into further |
| Screen: Home "Recently contacted"                    | none                                                                                 | n/a                                               | **Not looked at in a browser.** No web code changed; only the rows the API returns.                                     |

Gate: `bun run gate:fast` passed (22 of 22 tasks, all from the Nx cache).

## What these checks don't prove

- **The Home page was never seen.** The API returns the right rows, but nobody opened the panel and clicked a name.
  `/qa-ticket ACME-106` does that in a browser; it needs a person's review of its screenshots.
- **"No location selected → 400" is proved only by the unit test.** `bun run api` always sends a location, and it
  refuses a location the user doesn't work at before the server is reached, so neither case ran against the server.
  A test of the controller/guard would close it; the ticket doesn't ask for one.
- **Small data.** Each location has 3 to 10 customers, so "at most 5, newest first" is shown with only a few
  rows above the limit, and the query's speed on a million customers is not measured. Nothing needs doing: it is a
  `limit 5` filtered by dealer and location, but the "recently contacted" query has no index on `last_contact_date`
  checked here; the performance reviewer looks at it.
- **The guard across all handlers (option B) is not built.** Only this handler's test would catch a missing filter;
  a new handler can still repeat the mistake. A person decides on the follow-up ticket.
- **The new tests were seen to fail on the old handler, not by mutating the new one.** The verifier read them and did
  not mutate the handler.
