# Implicit state machines: what we found, and the plans to fix them

Found 7 Nov 2026 on `final` (`8919f20`), by reading the code of every service and the web app. Nothing was run, so no
race below has been reproduced yet: each plan starts with the test that should fail today.

## What we looked for

A **state machine** is anything that moves through named stages: a photo goes `pending → ready` or `failed`, an export
goes `queued → counting → writing → completed`, a tab goes `resolving → signed-in`. It is **explicit** when its states
and the moves allowed between them are declared in one place and every write is checked against them. It is
**implicit** when the stages are spread across the code and nothing stops a move that should not happen.

For each machine we asked four questions:

1. **Is every move guarded by the state it leaves?** (`UPDATE … WHERE status = 'pending'`, and a check of how many rows
   changed.)
2. **Does every unfinished state have a sure way out, and an owner?** An event that is sure to arrive, a timeout, or a
   sweeper, run by a named service. What happens when that exit never comes?
3. **What do duplicates, wrong order and a crash between two steps do?**
4. **What do two requests, two tabs and two instances do?**

The database enforces none of the moves: no `status` column has a `CHECK` on its values, and there is no trigger. The
web app has no reducer or transition table. The parts that already guard their moves well are the refresh-token chain
(a row lock per sign-in), the gateway's renewal lease (a conditional UPDATE), the signing-key ring (an advisory lock),
the export worker's writes (`heldWhere`) and the record versions behind `If-Match`.

## The plans

| Plan                                                | Machines                                                               | Branches                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| [Photos and documents](photo-document-lifecycle.md) | part photo, document, outbox, inbox, part ETag                         | `main` and every lab; the ETag part on `final` only |
| [Export jobs](export-job-lifecycle.md)              | export job (server), export card (web)                                 | `lab/09-export-final` and `final`                   |
| [Sign-in services](sign-in-lifecycle.md)            | gateway session, refresh chain, signing keys, throttle, seeding        | every branch (the files are the same)               |
| [Web app state](web-state.md)                       | auth kernel, location kernel, save and conflict, create dialog, guards | every branch; the 412 conflict on `final` only      |

## Every finding, worst first

**Checked** means the code was read again by hand after the search found it; **traced** means it was found by reading
the code but not read a second time. Ids are the plans' own.

### Blocking: data lost, wrong or stuck for good

| Id      | Finding                                                                                                                                                                       | Status          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| SIGN-1  | identity-api seeds demo data in every environment: it hard-deletes every user, dealer and location that is not demo data, and creates the demo users with the shared password | checked         |
| WEB-1   | switching location refetches the old location's queries with the new location's header: location B's rows are cached under location A's key                                   | checked         |
| PHOTO-1 | an event that arrives before the photo row is committed changes 0 rows and is acked: the photo is `pending` for good                                                          | checked         |
| PHOTO-2 | mark-ready and mark-failed have no starting-state guard: a late event flips `ready` to `failed` (or back), and deleted photos change                                          | checked         |
| PHOTO-3 | the part's ETag is its `version`, which photo and stock changes never bump: the 2 s poll gets `304` and the browser shows `pending` for good                                  | checked         |
| SIGN-2  | a signing key Data Protection cannot open is deleted at once; two instances with different key folders delete each other's keys, and every token signed by them stops working | checked         |
| SIGN-3  | a renewal whose answer is lost signs the user out if their next request comes more than about 10 s later                                                                      | checked         |
| EXP-1   | the previous user's export cards (with signed links to a `@Public()` download) survive a different user's sign-in in another tab                                              | checked         |
| EXP-2   | a swept export attempt that finishes late overwrites, then deletes, the file another attempt completed: the job says completed, the download says gone                        | checked         |
| DOC-1   | document-api's Process and Fail race Delete: a deleted document is marked ready and its event published; Delete then writes back a stale status                               | checked in part |
| DOC-2   | the processing consumer republishes without publisher confirms, then acks: a dropped republish leaves the document `Pending` for good                                         | checked         |
| WEB-2   | after a `412` the form keeps the old version: every save fails again until a reload (`final`)                                                                                 | traced          |
| EXP-3   | an export card whose event stream drops or ends without a final event stays "running" for good, timer climbing, no retry                                                      | traced          |
| EXP-4   | the download-link key is made per process: every link dies on a restart, and two instances refuse each other's links                                                          | checked         |

### Should-fix: cleared only by a person, a reload or a later request

| Id      | Finding                                                                                                                                                        | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PHOTO-4 | two uploads at once make two default photos, or pass the 10-photo limit                                                                                        | traced |
| PHOTO-5 | a consumer error dead-letters at once with no retry, and nothing reads the dead-letter queue                                                                   | traced |
| PHOTO-6 | a crash between the document upload and the photo row orphans the document                                                                                     | traced |
| DOC-3   | the outbox relay takes no row lock and saves once per batch: duplicates, and a poison row blocks every row behind it                                           | traced |
| EXP-5   | `heldWhere` ignores the attempt number: a worker that re-claims its own swept job runs it twice                                                                | traced |
| EXP-6   | after a location switch, Cancel on the old location's card is refused (row-level security), the error is swallowed, and Dismiss hides a job that keeps running | traced |
| EXP-7   | a POST that times out after the server committed leaves a job with no card; a retry makes a second one                                                         | traced |
| SIGN-4  | sign-out or sign-in that finds its session already deleted throws a concurrency error: `500`, cookie not cleared                                               | traced |
| SIGN-5  | the sign-in throttle checks, hashes, then records: parallel guesses all pass; the count is per instance                                                        | traced |
| SIGN-6  | sign-in's cleanup deletes refresh rows without the chain's lock: a refresh in flight gets `500` instead of `401`                                               | traced |
| WEB-3   | another tab's sign-in leaves this tab `resolving` for good if identity-api fails (blank page, no error)                                                        | traced |
| WEB-4   | another tab's sign-in by the same user clears this tab's location: a dirty form unmounts without asking                                                        | traced |
| WEB-5   | Back during sign-out leaves a tab that looks signed in and gets `401` on every request                                                                         | traced |
| WEB-6   | a part form keyed by `updatedAt` remounts when someone else saves while a photo is pending: unsaved edits are wiped                                            | traced |
| WEB-7   | the new-part dialog keeps the old location's bin after a switch, and navigates after being closed                                                              | traced |
| WEB-8   | photo polling has no limit                                                                                                                                     | traced |

Smaller ones (a stale error alert, a leaking bypass list, `processed_messages` and expired sessions never pruned, a
misleading comment about revocation) are listed in their plans.

## Unfinished states with no sure way out

The question the state reviewer now asks of every change. Each row is a state a record or a screen can stay in for good
today.

| Machine               | State                                  | Meant to leave by                 | Owner                                        | Why it may never come                                          |
| --------------------- | -------------------------------------- | --------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| part photo            | `pending`                              | `document.processed` / `failed`   | document-api, then dealership-api's consumer | event too early, dead-lettered, republish dropped              |
| document              | `Pending`                              | the processing message            | document-api                                 | republish unconfirmed, Fail throws, Delete overwrites          |
| outbox row            | not published                          | the relay, every second           | document-api                                 | a poison row blocks every row behind it                        |
| dead-lettered message | parked                                 | nothing                           | nobody                                       | no consumer, no replay                                         |
| export job            | `queued`, `counting`, `writing`        | a worker                          | the export workers                           | no worker running: stuck, and counted against the user's limit |
| export card           | following                              | a final event                     | dealership-api                               | the stream drops or ends quietly                               |
| gateway session       | renewal answer lost                    | the next request within the grace | gateway                                      | the user is idle for more than about 10 s                      |
| auth (tab)            | `resolving` after another tab signs in | the user check                    | auth kernel                                  | identity-api fails: no retry, no error                         |
| edit form             | conflict (`412`)                       | none                              | none                                         | the old version is kept until a reload                         |

There is no metric on how long a record has been in a state, anywhere.

## Order of work

1. **SIGN-1 now**: one line (`IsDevelopment()`), and the worst outcome of all.
2. **Photos and documents**: three bugs that together leave photos `pending` for good, and the pattern (a guarded move,
   a retry, a sweep) the other plans reuse.
3. **WEB-1 and EXP-1**: one location's data shown under another, and one user's exports shown to the next.
4. **SIGN-2 and SIGN-3**: before any deployment with two identity-api instances.
5. **Export jobs**, then **web app state**.

Each plan's changes go on `main` first when the code is there, then to the labs and `final`, as the repository's
`CLAUDE.md` says. The labs' room exercises (ACME-106's hand-written filters, the export-panel bug on 09-export-after and
lab 10) stay as they are.

## So we catch the next one in review

`.claude/agents/state-reviewer.md` reviews every change that touches a stage. It writes down each machine's states and
moves, lists every unfinished state with its way out and its owner, and plays the change through duplicates, wrong
order, a crash between steps, two requests, two tabs and two instances. `/review-pr` runs it with the other four;
`/ticket-to-pr` runs it when the diff touches a status, a job, a message, a lease, a cache, sign-in, a kernel or a form.

## Review round 1 (7 Nov 2026)

Two reviewers read the plans against the code: the `architect` (is each fix the simplest that fits this codebase) and the
`state-reviewer` applied to the fix designs themselves (would the fix leave a new stuck state or race). Each plan now
ends with what changed in its decisions and the questions only a person can answer. Two things hold for all of them:

- **Migrations are made on each branch, never cherry-picked.** `main`, `lab/09-export-final` and `final` each have their
  own Drizzle snapshot chain; a `CHECK`, an index or a column is generated separately on each branch that gets it.
- **"The same on every branch" is checked per file, not assumed.** The web `apiClient.ts` on `main` and the labs up to
  `lab/09-export-before` has no `headers`, `timeout` or `readEventsAsync`: those are lab 9's answer and are never copied
  back.

**Done:** SIGN-1 (seeding in Development only), on `main` first.

## Answers (7 Nov 2026)

Zafar Ali took the recommendations:

- **Users outside Development:** none are created for now; a way to create dealers and users is a feature of its own.
- **Photos:** a photo still processing after 10 minutes is failed, "timed out"; the page stops asking after 2 minutes
  and says the photo is still being processed; a failed photo shows its reason on the tile.
- **Save conflicts:** "Reload their version" and "Keep my edits", which puts this user's changes onto theirs.
- **Exports after a location switch:** the panel shows only this location's exports; the others come back on
  switching back.
