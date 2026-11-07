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

## Open findings

Second sweep's ids are `S2-…`; the area follows (`DOC`, `PHOTO`, `SIGN`, `WEB`, `EXP`).

Every boxed finding of the second sweep is fixed (see "Fixed"), except one accepted on purpose:

- **S2-DOC-3, the outbox row lock:** two document-api instances can publish the same message. Accepted: every consumer
  drops a duplicate (dealership-api's inbox; document-api's `Pending` check and row version). Its other half, pruning
  published rows, is done.

Smaller, noted in the searches and not boxed: a cancelled export card's failure is swallowed; a second Save click
during the post-save navigation sends the old version; an expired renewal answer with no cookie keeps the rotated
token; a stale comment in `AccessTokenIssuer.cs` about services asking identity-api; the orphan scan's `stat` race;
`early_document_outcomes.status` has no CHECK; stock levels are last write wins.

## Fixed (7 Nov 2026)

Each with a test that fails on the old code where one could be written. Commits on `final`; the labs and `main` carry
the ones whose code they have.

| Finding                      | Fix                                                                                                         | Commit on `final`                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| SIGN-1                       | migrations everywhere, demo data in Development only                                                        | `ff71a88`                         |
| SIGN-4, SIGN-6               | a session or token already gone is not an error                                                             | `722bc53` and the three before it |
| SIGN-3                       | one immediate retry of a lost renewal (interim; S2-SIGN-4 remains)                                          | same range                        |
| SIGN-2                       | keys published from a stored public half; never deleted outside Development; health degraded                | `722bc53`, `2e13b7b`              |
| SIGN-5                       | an attempt is reserved before the password check                                                            | `e1d81d3`                         |
| DOC-1, DOC-2                 | `xmin` row version; Delete re-reads; confirmed republish; Fail in a fresh scope                             | `930d73a`                         |
| DOC-3                        | the outbox saves each message once confirmed and skips one that is not JSON (row lock still open: S2-DOC-3) | `53452a3`                         |
| EXP-2, EXP-4, EXP-5          | writes and files fenced by attempt; orphan sweep; shared link key; status CHECK                             | `c353253`                         |
| EXP-1, EXP-6                 | a card is followed and cancelled at its own location; a change of user clears them                          | `94e4183`                         |
| EXP-3, EXP-7                 | reconnect, stall with Retry, a start resent with its key                                                    | `172fd92`                         |
| WEB-1                        | a query asks for the location its key names                                                                 | `703b705`                         |
| PHOTO-1, PHOTO-2, PHOTO-4    | moves only from `pending`; early outcomes kept and applied; uploads take turns                              | `2743a15`                         |
| PHOTO-5                      | retry queue (hole: S2-PHOTO-1)                                                                              | `c88fa96`                         |
| PHOTO-3                      | the part GET is never a 304                                                                                 | `b375b03`                         |
| WEB-8                        | the photo poll stops after 2 minutes and says so; a failed photo shows its reason                           | `4a15811`                         |
| WEB-3, WEB-4, WEB-5, WEB-7   | same user keeps the tab; another reloads it; sign-out leaves itself; the dialog resets                      | `cddb717`                         |
| WEB-6                        | a newer version never wipes unsaved edits                                                                   | `15e03db`                         |
| WEB-2                        | a stale save is refused and fetches theirs; keep my edits (photo hole: S2-WEB-1)                            | `0d51e68`                         |
| S2-WEB-1                     | keep my edits merges the photo lists                                                                        | `854e204`                         |
| S2-PHOTO-1                   | the dead-letter queue takes an event dead-lettered after its retries                                        | `c31b5c1`                         |
| S2-PHOTO-2, S2-PHOTO-3       | a photo pending past 10 minutes is failed, timed out; early outcomes and inbox rows pruned                  | `e96fe4c`                         |
| S2-DOC-1                     | a document pending past 8 minutes is failed and says so; old outbox rows pruned                             | `363acdf`                         |
| S2-SIGN-1, S2-SIGN-2         | health is 503 when degraded; `replace-signing-keys`, with its runbook in `ARCHITECTURE.md`                  | `7e05e56`                         |
| S2-EXP-1, S2-EXP-2, S2-EXP-3 | link key needed outside development; reconnects counted afresh; no expired link offered                     | `41838d2`                         |
| S2-PHOTO-4, S2-PHOTO-5       | a save counts again under the part lock; nothing escapes a closed channel                                   | `6283f58`                         |
| S2-SIGN-3, S2-SIGN-4         | an attempt without a verdict is not counted; a renewal unanswered twice is logged                           | `83d1497`                         |
| S2-DOC-2                     | bad JSON is dead-lettered; a refused retry goes back to the queue                                           | `ee28fec`                         |
| S2-WEB-2, S2-WEB-3           | the photo poll keeps one clock; an edit is saved at the location shown at Save                              | `da3ecc1`                         |

Still open from the first sweep, left on purpose: PHOTO-6 (orphaned documents), the renewal attempt-key protocol,
cancelling an export during its count, the stale save-error alert, the unique default-photo index.

## Unfinished states with no sure way out

| Machine             | State    | Meant to leave by | Owner              | Why it may never come                                    |
| ------------------- | -------- | ----------------- | ------------------ | -------------------------------------------------------- |
| dead-lettered event | parked   | nothing           | nobody             | no consumer, no replay: a person reads the `.dlq` queues |
| export job          | `queued` | a worker          | the export workers | no worker running                                        |

Given a way out since the second sweep: a document or photo whose answer never comes (the sweeps, 8 and 10 minutes), an
active signing key no instance can open (`replace-signing-keys`, health 503), an expired export link (the card), an
early outcome whose upload failed (pruned after a day).

## Order of work

1. Run the e2e suite on `final`, `edit-conflicts.spec.ts` first (it covers S2-WEB-1 too).
2. Left on purpose, each a later decision: PHOTO-6 (orphaned documents), the renewal attempt-key protocol, cancelling an
   export during its count, the stale save-error alert, the unique default-photo index, a consumer for the dead-letter
   queues.
3. The smaller items listed under "Open findings".

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
