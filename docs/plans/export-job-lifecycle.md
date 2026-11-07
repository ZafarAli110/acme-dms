# Plan: one declared lifecycle for an export, on the server and on the card

Branch: `lab/09-export-final` and `final`, which share `export-worker.ts` and `exportKernel.ts`. Not `lab/09-export-after`
or lab 10: they have the older in-memory runner, and keep the export-panel bug as a room exercise. Part of
[implicit state machines](implicit-state-machines.md).

## Why

The server's job is close to explicit: every worker write goes through `heldWhere`, cancel takes a row lock, the claim
uses `SKIP LOCKED`, and the sets `ACTIVE`, `RUNNING` and `FINISHED` are named (`export-queue.ts:38-41`). What is missing
is one table of moves, a fence on the attempt, and a client that models the card at all.

**Server**

- **EXP-2 (checked).** Every attempt renames to `${jobId}.xlsx` (`export-worker.ts:487`), and renames _before_
  `completeAsync` checks it still holds the job (`:298`). An attempt that was swept but finishes late overwrites the file
  another attempt completed, loses `completeAsync`, and `rm`s the file (`:301`): the job says completed, the download
  `410`.
- **EXP-4 (checked).** `download-link.ts:5` signs with `randomBytes(32)` made at start: every link dies on a restart,
  and two instances refuse each other's links.
- **EXP-5 (traced).** `heldWhere` (`:477-483`) matches id, worker and a running status, not the attempt. A worker whose
  heartbeats fail long enough is swept by its own sweeper and re-claims the job under the same worker id: both runs
  write one row, and the old run's `finally` deletes the new run's `_running` entry (`:197-199`).
- **Also (traced):** the abort listener is attached only after `countAsync` (`:329-338`), so a cancel during a long
  count waits for the statement timeout; a file deleted between the link check and `open()` answers `500`, not `410`;
  a crash after the rename leaves `${id}.xlsx` that the sweep never removes; `status` has no `CHECK`; the per-dealer
  limit can be passed by two claims at once (the code says so, `:153-155`).

**Card (web)**

- **EXP-1 (checked).** `authKernel.forget()` (`authKernel.ts:135`) clears the session and the query cache, not
  `exportKernel`. When another tab signs in as someone else, this tab keeps the previous user's cards, their signed
  download links (the route is `@Public()`) and their event streams.
- **EXP-3 (traced).** `readEventsAsync` has no reconnect and no silence timeout. A network error sets `problem` but the
  card stays running; a stream that ends with no final event sets nothing; a laptop sleep hangs it.
- **EXP-6 (traced, `final`).** Cards are not tied to a location. Switch location, press Cancel: the `DELETE` carries the
  new location, row-level security hides the job, `404`, swallowed by `void cancelAsync`; Dismiss removes the card while
  the job runs on.
- **EXP-7 (traced).** Each press gets a new idempotency key and the client never retries: a POST that times out after
  the server committed leaves a job with no card, and pressing again starts a second.
- **Also:** "running" is defined three times (`ExportCard.tsx:45`, `ExportsButton.tsx:14`, the kernel's `FINISHED`); a
  card never notices its link has expired; `startAsync` and `restoreAsync` can both follow one job, and the second
  `_following.set` orphans the first stream.

## The machines, declared

**Job** (`export-job-state.ts`, used by the queue and the worker)

| From → to                                     | Trigger                                | Guard                                                 |
| --------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `queued` → `counting`                         | claim                                  | `SKIP LOCKED`; attempt + 1                            |
| `queued` → `cancelled`                        | user                                   | row lock                                              |
| `counting` → `writing`                        | count done                             | held (id, worker, **attempt**)                        |
| `counting`/`writing` → `completed`            | file written                           | held, no cancel requested; then the file is published |
| `counting`/`writing` → `cancelled` / `failed` | cancel seen / error / time limit       | held                                                  |
| `counting`/`writing` → `queued`               | sweep: heartbeat stale, attempts < max | conditional UPDATE                                    |
| `completed` → `expired`                       | sweep or cancel after completion       | conditional UPDATE; deletes `file_path`               |

**Card** (a union in the kernel): `requesting → following ⇄ reconnecting → ready | finished(status) | lost`, with
`stalled` when the watchdog fires.

## Decisions

1. **Attempt-fenced writes.** `heldWhere(jobId, attempt)`; `_running` keyed by `${id}:${attempt}`.
2. **A file per attempt, published after the claim holds.** Write `${id}-${attempt}.part`, complete the row with
   `file_path = ${id}-${attempt}.xlsx` in the fenced UPDATE, then rename. The sweep deletes the stored `file_path`,
   never a path it recomputes; it also removes `.xlsx` files no row points at.
3. **The link key comes from settings** (`EXPORT_LINK_KEY`), required outside Development.
4. **Cancel interrupts the count**: the listener goes on before `countAsync`.
5. **`CHECK (status IN (…))`** on `export_jobs`.
6. **The card knows whose and where it is.** Each card carries `userId` and `locationId`; `forget()` calls
   `exportKernel.reset()`; a location switch hides the other locations' cards (and Cancel sends the card's own location).
7. **The card is never stuck.** A watchdog at 3 × the progress interval: an error, a quiet end or silence moves it to
   `reconnecting` with back-off, then `getAsync`; a `404` is `lost`. A `ready` card sets a timer to `expiresAt`.
8. **One key per intent.** The key is made when the user confirms and reused on a retry of that POST.
9. **One `isRunning(status)`**, exported from the kernel.

## Tests (each fails today)

- `export-worker.test.ts`: a swept attempt's late writes change 0 rows; a late attempt never deletes a completed file
  (the download still answers `200`); `_running` keeps the new attempt.
- the migration test: `status = 'bogus'` is refused.
- `download-link` test: a link signed with the configured key still validates after a restart.
- `exportKernel.test.ts` (new): a quiet end → reconnecting → resumes; an error then `404` → lost; `forget()` empties the
  cards; a double follow keeps one controller; a POST timeout retries with the same key.
- `web/e2e/export.spec.ts`: switch location and cancel the first location's card → the job is cancelled; sign in as
  another user in a second tab → no cards.
