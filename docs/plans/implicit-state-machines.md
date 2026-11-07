# Implicit state machines: what we found, and the plans to fix them

First sweep 7 Nov 2026 on `final` (`8919f20`); its fixes were built the same day (see "Fixed"). Second sweep, with
`/find-state-machines`, on `final` (`a68506f`): it checked every earlier finding and looked for new stages in the new
code. Both sweeps read the code; nothing was run. **Checked** means the code was read again by hand after a search found
it; **inferred** means it rests on how a library or broker behaves.

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

## Open findings, worst first

Second sweep's ids are `S2-…`; the area follows (`DOC`, `PHOTO`, `SIGN`, `WEB`, `EXP`).

### Blocking: data lost, wrong or stuck for good

| Id         | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| S2-PHOTO-1 | **A retried document event is dropped, not dead-lettered.** It comes back to `dealership-api.document-events` with that queue's name as its routing key; the queue has no dead-letter routing key and the DLQ is bound only to `document.processed`/`document.failed`, so after five tries it matches nothing (`document-events.consumer.ts`, topology). Introduced by the retry queue (`c88fa96`); the unit test faked the routing key. Fix: bind the DLQ to the queue's name too, or give the queue `deadLetterRoutingKey`. | checked (routing inferred) |
| S2-DOC-1   | **A `Pending` document has no exit but its own message.** When Fail throws on the last attempt, the message is dead-lettered and nothing sweeps old `Pending` documents (`ProcessDocumentConsumer.cs`); its photo stays `pending` too. The plan's "re-enqueue, then fail" was never built.                                                                                                                                                                                                                                    | checked                    |
| S2-PHOTO-2 | **A `pending` photo has no deadline.** The 10-minute "timed out" (your answer) has no sweep behind it; the page stops asking after 2 minutes, but the record stays `pending` for good if its event never comes. Same sweep as S2-DOC-1, on the dealership side.                                                                                                                                                                                                                                                               | checked                    |
| S2-SIGN-1  | **An active signing key no instance can open stops every sign-in, with no way out.** Outside Development it is kept (by design) and no new key is made until rotation is due, up to 30 days; nothing tells a person (S2-SIGN-2) and there is no command or runbook to recover.                                                                                                                                                                                                                                                | checked                    |
| S2-WEB-1   | **"Keep my edits" deletes the other person's photos.** When the user touched photos, their list is kept; `update-part` treats the list it receives as the complete list to keep and soft-deletes the rest, so a photo the other person added is gone (`PartForm.tsx` keepMine, `update-part.command-handler.ts`). Fix: merge the lists (theirs, plus the user's new files, minus what the user removed).                                                                                                                      | checked                    |

### Should-fix: cleared only by a person, a reload or a later request

| Id         | Finding                                                                                                                                                      | Status   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| S2-SIGN-2  | identity-api's health says `degraded` with HTTP 200: Aspire and a load balancer read the code, so an instance that cannot sign keeps taking sign-ins.        | checked  |
| S2-DOC-2   | Bad JSON (deserialised outside the `try`) or a failed republish leaves a process message neither acked nor nacked; four such stall the consumer.             | checked  |
| S2-PHOTO-3 | `early_document_outcomes` and `processed_messages` are never pruned.                                                                                         | checked  |
| S2-PHOTO-4 | A PATCH that adds photos counts and sets the default before its transaction, not under the part lock: with a concurrent upload, 11 photos or two defaults.   | inferred |
| S2-PHOTO-5 | A handler finishing after its channel closed (a reconnect) acks on a dead channel; the throw escapes `void handleAsync` as an unhandled rejection.           | inferred |
| S2-EXP-1   | `EXPORT_LINK_KEY` is required only when `NODE_ENV=production`; a staging or second instance still makes its own key.                                         | checked  |
| S2-EXP-2   | A card's reconnect counter is never reset: six brief drops over a long export leave it `stalled` while it runs fine.                                         | checked  |
| S2-EXP-3   | A completed card never notices `expiresAt`: Download leads to a 410.                                                                                         | checked  |
| S2-WEB-2   | The photo poll compares the server's `createdAt` with the browser's clock: a fast laptop never polls.                                                        | inferred |
| S2-WEB-3   | Saves still send the selected location, not the one the form opened at; the form guard is off while submitting.                                              | inferred |
| S2-SIGN-3  | The throttle counts an attempt that a database error or a cancelled request ends as a wrong password: a user retrying through an outage gets 429 afterwards. | checked  |
| S2-SIGN-4  | When both renewal calls time out after identity-api committed, the user is signed out on the next request more than 20 s later (the interim's limit).        | inferred |
| S2-DOC-3   | Two document-api instances publish the same outbox rows (no row lock); published rows are never pruned.                                                      | checked  |

Smaller, noted in the searches and not boxed: a cancelled export card's failure is swallowed; a second Save click
during the post-save navigation sends the old version; an expired renewal answer with no cookie keeps the rotated
token; a stale comment in `AccessTokenIssuer.cs` about services asking identity-api; the orphan scan's `stat` race;
`early_document_outcomes.status` has no CHECK; stock levels are last write wins.

## Fixed (7 Nov 2026)

Each with a test that fails on the old code where one could be written. Commits on `final`; the labs and `main` carry
the ones whose code they have.

| Finding                    | Fix                                                                                                         | Commit on `final`                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| SIGN-1                     | migrations everywhere, demo data in Development only                                                        | `ff71a88`                         |
| SIGN-4, SIGN-6             | a session or token already gone is not an error                                                             | `722bc53` and the three before it |
| SIGN-3                     | one immediate retry of a lost renewal (interim; S2-SIGN-4 remains)                                          | same range                        |
| SIGN-2                     | keys published from a stored public half; never deleted outside Development; health degraded                | `722bc53`, `2e13b7b`              |
| SIGN-5                     | an attempt is reserved before the password check                                                            | `e1d81d3`                         |
| DOC-1, DOC-2               | `xmin` row version; Delete re-reads; confirmed republish; Fail in a fresh scope                             | `930d73a`                         |
| DOC-3                      | the outbox saves each message once confirmed and skips one that is not JSON (row lock still open: S2-DOC-3) | `53452a3`                         |
| EXP-2, EXP-4, EXP-5        | writes and files fenced by attempt; orphan sweep; shared link key; status CHECK                             | `c353253`                         |
| EXP-1, EXP-6               | a card is followed and cancelled at its own location; a change of user clears them                          | `94e4183`                         |
| EXP-3, EXP-7               | reconnect, stall with Retry, a start resent with its key                                                    | `172fd92`                         |
| WEB-1                      | a query asks for the location its key names                                                                 | `703b705`                         |
| PHOTO-1, PHOTO-2, PHOTO-4  | moves only from `pending`; early outcomes kept and applied; uploads take turns                              | `2743a15`                         |
| PHOTO-5                    | retry queue (hole: S2-PHOTO-1)                                                                              | `c88fa96`                         |
| PHOTO-3                    | the part GET is never a 304                                                                                 | `b375b03`                         |
| WEB-8                      | the photo poll stops after 2 minutes and says so; a failed photo shows its reason                           | `4a15811`                         |
| WEB-3, WEB-4, WEB-5, WEB-7 | same user keeps the tab; another reloads it; sign-out leaves itself; the dialog resets                      | `cddb717`                         |
| WEB-6                      | a newer version never wipes unsaved edits                                                                   | `15e03db`                         |
| WEB-2                      | a stale save is refused and fetches theirs; keep my edits (photo hole: S2-WEB-1)                            | `0d51e68`                         |

Still open from the first sweep, left on purpose: PHOTO-6 (orphaned documents), the renewal attempt-key protocol,
cancelling an export during its count, the stale save-error alert, the unique default-photo index.

## Unfinished states with no sure way out

| Machine             | State                      | Meant to leave by               | Owner                             | Why it may never come                                                    |
| ------------------- | -------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| document            | `Pending`                  | the processing message          | document-api                      | Fail throws on the last try; the message is lost (S2-DOC-1)              |
| part photo          | `pending`                  | `document.processed` / `failed` | document-api, then dealership-api | a dropped retry (S2-PHOTO-1), a stuck document; no deadline (S2-PHOTO-2) |
| dead-lettered event | parked                     | nothing                         | nobody                            | no consumer, no replay                                                   |
| signing key         | active, unopenable here    | rotation in up to 30 days       | nobody                            | no command, no runbook, health says 200 (S2-SIGN-1)                      |
| export job          | `queued`                   | a worker                        | the export workers                | no worker running                                                        |
| export card         | completed past `expiresAt` | nothing                         | nobody                            | the card never checks (S2-EXP-3)                                         |
| early outcome       | stored                     | its upload                      | the upload                        | the upload failed or was refused (S2-PHOTO-3)                            |

Fixed since the first sweep: an export card left "running", a tab stuck `resolving`, a form stuck on a 412, a document
overwritten by a racing Delete.

## Order of work

1. **S2-PHOTO-1**: one binding, and the dead-letter path works again. A test against a real broker would have caught it.
2. **S2-WEB-1**: merge the photo lists on "Keep my edits".
3. **S2-DOC-1 and S2-PHOTO-2**: one sweep in each service, with the 10-minute deadline you chose; S2-PHOTO-3's pruning
   rides on the same sweep.
4. **S2-SIGN-1 and S2-SIGN-2**: health answers 503 when it cannot sign, and a decided way out (a command, or a successor
   key published at once), with a runbook.
5. The should-fix list, starting with S2-DOC-2, S2-EXP-1 and S2-SIGN-3.

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
