# ACME-125: When a save gets no answer, saving again is always safe: nothing is added twice

**Created:** 2026-11-09 23:58

**Status:** In progress

**Ticket:** ACME-125 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Follows: the customer and part forms' save alert (`ErrorAlert during="save"`) and the edit forms'
"changed elsewhere" alert; no new screen

**Now:** Done: steps 1, 2, 5; step 3's code and step 4's specs written · Next: rebuild and restart the running system
(it runs the `start:prod` build from before ACME-125), then step 3's browser check, step 4's e2e, step 6 · Blocked:
the restart is Zafar Ali's to run or allow

## Requirement

Sam presses Save, the page says the server took too long: did it save? Pressing Save again must always be safe: the
save happens once, whether or not the first went through.

- **In:** every save the API has (customer add and change, part add and change with its photos, photo upload, bin add,
  stock set) takes a key and is done once per key; the customer and part screens send one and say what happened.
- **Out:** screens for adding a bin, setting stock and uploading a photo on its own (none exist; Zafar Ali, 9 Nov:
  checked through the API); spotting duplicate customers; the page re-sending a save by itself.

## Acceptance criteria: the goal

Happy

- [ ] Add a customer as `sam`; the request reaches the server and only its answer is lost → the form keeps every field
      and says "We could not confirm the save. Save again: it will never be added twice."
- [ ] Save again, unchanged → the customer opens as saved; the list shows them once
- [ ] Same, but change the phone before saving again → "Your first save went through", and the customer opens with the
      first phone number
- [ ] The first save never reaches the server (dropped before it is sent), change a field, save again → the changed
      form is saved, once
- [ ] Change a customer, lose the answer, save again → saved, never "someone else changed this record"
- [ ] Change a part (with a new photo), lose the answer, save again → saved once: one new photo, no 412
- [ ] Add a part in the dialog, lose the answer, save again → one part, never "part number already in use"
- [ ] Double-click Save on a new customer → one customer
- [ ] Through the API, the same key twice: a bin added once (the second answer the first's,
      `Idempotent-Replayed: true`), stock set once, one photo uploaded once
- [ ] Save again while the first is still running → "Your first save is still going through. Wait a moment, then
      press Save again."; the next Save gets the first's answer
- [ ] With a steady connection every save behaves as today (e2e all pass)

Failure: invalid input, absent data, not allowed, another service down

- [ ] A save refused for something the person can fix (a missing field, part number in use) → as today; fixing it and
      saving again with the same key saves it
- [ ] A save told "busy" with a key → 503 `busy` as today ("nothing was saved"), within the save's 5 s wait; saving
      again saves it once
- [ ] A save that fails after its commit (a photo's document not deleted, the re-read) → saving again never runs it
      again
- [ ] A first save still running when its lease runs out, and a second taking over → one of them saves, never both
- [ ] The same key 24 hours later → a new save
- [ ] Another user, or another dealer, sending the same key → their own save, never someone else's answer
- [ ] A key that is not 1–255 visible characters → 422, nothing saved

## Load before building

| Item                                            | Kind     | Why                                          | Loaded? |
| ----------------------------------------------- | -------- | -------------------------------------------- | ------- |
| `docs/standards/api-errors.md` (all)            | Standard | new problem types, 409/422, If-Match         | [x]     |
| `docs/standards/multi-tenancy.md` "Location"    | Standard | the record table's policy (dealer and user)  | [x]     |
| `docs/standards/database.md` "Audit columns"    | Standard | the record table is a technical table        | [x]     |
| `docs/standards/web-architecture.md` "Forms"    | Standard | the forms' key and messages                  | [x]     |
| `docs/standards/business-handlers.md` "Exports" | Standard | the export key: the pattern followed         | [x]     |
| `docs/ARCHITECTURE.md` "Handling load"          | Standard | busy, the saves' 4 connections, cancellation | [x]     |
| `tanstack-query`                                | Skill    | the part dialog's mutation                   | [x]     |
| `check-in-browser`                              | Skill    | the messages at 1440 and 1024                | [x]     |

## Shape

**Follows:** the export start's key (`export-queue.ts` `enqueueAsync`: key format, fingerprint, 422 on a different
request), and the web's `exportKernel.startAsync` (one key per intent, the same key on a retry) · **Deviates:** a
record of the answer is kept (exports re-read their job instead), and a lease with a holder (in progress → 409)

Files (each checked to exist, or marked **new**). `B` is `backend/dealership-api/src`, `W` is `web/app`:

1. `B/persistence/schema/idempotency-records.ts` (**new**) and a migration: `(dealer_id, user_id, key)` primary key,
   `fingerprint`, `state` (`running` | `committed` | `done`), `holder` (uuid, new on every claim and takeover),
   `lease_until`, `answer` jsonb, `resource` text, `expires_at` (24 h); a policy by dealer and user
2. `B/business-logic/idempotency/idempotency-records.ts` (**new**): `claimAsync`, `commitClaimAsync`, `completeAsync`,
   `releaseAsync`, `sweepAsync`; `B/business-logic/idempotency/idempotency-sweeper.ts` (**new**)
3. `B/service/idempotency/idempotent.decorator.ts` (**new**): `Idempotent(resourceOf)`, the innermost interceptor, so
   a replayed body passes back through `@Created` and `@ETagged`; `idempotency.interceptor.ts` (**new**)
4. `B/request-scope/data-scope.ts`: `RequestInfo.idempotency` (the claim); `runDetachedFromCaller(run, { afterCommit })`
   (`afterCommit` gives the detached request `committed: true`: waits as background work, never "busy")
5. `B/persistence/unit-of-work/unit-of-work.factory.ts`: before COMMIT, a request with a claim runs `commitClaimAsync`
   in the save's transaction; 0 rows (the claim no longer this request's) throws, and the save rolls back
6. Controllers `customer-command`, `part-command`, `bin-command`, `stock-command`: `@Idempotent(...)` on the 7 writes
7. `B/service/problem-details/problem-type.ts`: `save-in-progress` (409), `save-went-through` (409, `resource`),
   `idempotency-key` (422); `B/i18n/catalogs/en.ts`, `fr.ts`
8. `B/persistence/schema/__test__/schema.test.ts` (the table with `dealer_id`); `docs/standards/database.md` "Audit
   columns" (the technical table); `docs/standards/api-errors.md`, `docs/contracts.md` (`Idempotency-Key`)
9. `W/core/hooks/useSaveKey.ts` (**new**); `W/core/config/apiErrors.ts` (the types, the "could not confirm" message)
10. `W/pages/customers/CustomerForm.tsx`, `CustomerCreate.tsx`, `CustomerEdit.tsx`, `queries/customerQueries.ts`
11. `W/pages/parts/PartForm.tsx`, `PartEdit.tsx`, `PartCreateDialog.tsx`, `queries/partQueries.ts`
12. `W/locales/{en,fr}/common.json`; `web/e2e/save-again.spec.ts` (**new**: one file for the ticket's six
    journeys, as `busy.spec.ts` is for ACME-122, rather than spread over `customers.spec.ts` and `parts.spec.ts`)

```ts
// idempotency.interceptor.ts (new)
const key = request.headers["idempotency-key"];          // none: run as today (D5)
if (!IDEMPOTENCY_KEY.test(key)) throw 422 idempotency-key;
const fingerprint = sha256(method, route, params, If-Match, body, files' sha256);
// Claimed apart from the request: its commit must not mark the request committed, or the save after it would never
// be told "busy" (the architect's 1). Busy here → 503, nothing claimed.
const claim = await runDetachedFromCaller(() => records.claimAsync(scope, key, fingerprint, LEASE_MS));
switch (claim.kind) {
  case "mine": case "taken-over": request.idempotency = claim; break;   // new holder; lease 2 × REQUEST_TIMEOUT (60 s)
  case "replay":       setHeader("Idempotent-Replayed", "true"); return of(claim.answer);   // done, same fingerprint
  case "running":      throw 409 save-in-progress, Retry-After: 2;                          // same key, leased
  case "went-through": throw 409 save-went-through { resource };       // done or committed, another fingerprint
}
return next.handle().pipe(
  tap((body) => runDetachedFromCaller(() => records.completeAsync(claim, body, resourceOf(body)), { afterCommit: true })),
  catchError((error) => from(runDetachedFromCaller(() => records.releaseAsync(claim))).pipe(() => throwError(() => error))),
);
// releaseAsync: `delete … where holder = $holder and state = 'running'`: a committed claim is never freed (the
// architect's 3); detached, so a caller who left still frees it (4).
// unit-of-work.factory.ts, inside the save's own transaction, before COMMIT:
//   update idempotency_records set state = 'committed' where … and holder = $holder and state = 'running'
//   0 rows → throw: a first save whose lease was taken over cannot commit beside the second (2)
// `committed` without an answer (the process died between the commit and `completeAsync`): a replay answers
// 409 save-went-through with `resource` when known, and never runs the save again.
```

The web: `useSaveKey()` gives the form a key, sent as `idempotency-key`, kept while unanswered (changed fields or not)
and replaced after a save is answered as saved. A timeout or lost connection on a keyed save says "We could not
confirm the save…"; `save-in-progress` says "still going through"; `save-went-through` opens `resource` with "Your
first save went through". A second press while one is in flight is ignored (a ref, not only `isSubmitting`).

**Impact:** Breaking changes: None: a save without the header behaves as today · Depends on: a migration (a new, empty
table) · Performance: per save, two short extra transactions on the saves' connections (the claim before, the answer
after) and one update inside the save's own; at 5% writes on the busy morning, about 330 saves a second at 3,300, each
extra transaction a primary-key write of under a millisecond; reads unchanged. A busy claim answers 503 before anything
is claimed or saved.

## Tests

| Kind                    | File                                                                | Proves                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Handler (real Postgres) | `B/business-logic/idempotency/__test__/idempotency-records.test.ts` | claim, replay, running, went-through, takeover (new holder), release only while running, 24 h, user and dealer                                                                                                                                   |
| Interceptor + handlers  | `B/service/idempotency/__test__/idempotency.interceptor.test.ts`    | 7 writes once; PATCH replay 200; busy → 503 and key freed; fails after commit → not run again; lease taken over while the first runs → one save; caller gone → key freed                                                                         |
| Unit (web)              | `W/core/hooks/__test__/useSaveKey.test.ts`                          | the key kept until answered, new after a save                                                                                                                                                                                                    |
| End to end (Playwright) | `web/e2e/customers.spec.ts`, `web/e2e/parts.spec.ts`                | answer lost after the request reached the API (`route.fetch()`, then the page's connection fails): once; changed phone → went through; request dropped before it is sent (`route.abort()`), changed → the change saved once; double-click → once |

## Steps

- [x] 1. The record: schema, migration, `idempotency-records.ts`, sweeper, `schema.test.ts` → verify: its tests
- [x] 2. The interceptor, the commit marker, the detached claim and release, problem types and messages → verify:
      interceptor tests (all 7 writes, busy, after-commit failure, takeover, caller gone)
- [ ] 3. The web: `useSaveKey`, the customer forms, the part form and dialog, the messages (en, fr) → verify: unit
      tests; check-in-browser at 1440 and 1024
- [ ] 4. End to end: answers lost after and before the server, a changed second save, a double click → verify: e2e
- [x] 5. Docs: `api-errors.md`, `contracts.md`, `database.md` → verify: `docs:check`
- [ ] 6. `verify-ticket` → `docs/evidence/ACME-125.md`

## Questions

None: the interview's answers are in Requirement and D1–D2.

## Decisions

- D1 The API makes all seven saves safe; the web on its three save screens; bins, stock and a photo on its own are
  checked through the API (Zafar Ali, 9 Nov).
- D2 Save pressed while the first is running → "Your first save is still going through. Wait a moment, then press Save
  again."; the page never re-sends by itself (Zafar Ali, 9 Nov).
- D4 One key per form intent, kept across edits until a save is answered: a changed form after a lost answer is how
  "Your first save went through" is detected (the same key, another fingerprint) (Claude, default).
- D5 A save sent without a key behaves as today: API callers keep working (Claude, default; if wrong, a 428).
- D6 A refusal (4xx) before the commit frees the key: the corrected form saves with it (Claude, default).
- D8 `@Idempotent("created" | "path" | "none")` names where the saved record is read: an add's `@Created` Location, a
  change's own path, or none (a bin, a stock level, a photo: no single read). `resource` is an RFC 9457 extension
  member on `save-went-through` only, `null` when not known (Claude, while building).
- D9 A save whose answer never comes (a time limit unsubscribes) frees its key; if it is still running, its commit
  marker then finds no key and it rolls back, so the key is never held for nothing (Claude, while building).
- D7 One ticket, not two (the API, then the web): the web's three messages are the API's three answers, and the ticket's
  checks run end to end; about 1,100 lines estimated, built and committed step by step (Claude).

## Log

- 2026-11-09 23:58 Research (read-only searcher): no save takes a key but the export start; a repeated customer add
  duplicates, a repeated part or customer change gets 412, a repeated photo upload adds a photo; no web screen for
  bin, stock or a photo on its own; client timeout 15 s, server 30 s; 422 has no problem type. Interview (Zafar Ali):
  D1, D2, and the build runs to the end and is reported.
- 2026-11-10 00:02 Architect: CHANGES, 10 findings, all fixed: the claim no longer marks the request committed (busy as
  today); a lease of 60 s with a holder, the commit marker only for the holder; a committed claim never released;
  release and the answer detached, the answer never "busy"; a box for the first save never arriving; e2e says how an
  answer is lost; the real cost per save; `database.md` and `schema.test.ts` added; why one ticket (D7); D3 moved here.
  Also from the NestJS checklist: `Idempotent-Replayed: true` on a replay.
- 2026-11-10 00:07 Go-ahead from Zafar Ali; the build starts next session at step 1 (after loading the rows).
- 2026-11-10 00:16 Loaded the eight rows; In progress. Step 1: `idempotency_records` (key per dealer and user, policy by both),
  `IdempotencyRecords` (claim in one `insert … on conflict do update where expired or lease out`, `xmax = 0` for
  mine/taken-over), `IdempotencySweeper` (AppModule, every 10 min); `RequestInfo.idempotency`; `runDetachedFromCaller`
  takes `sharedWait` (the claim spends the save's one wait) and `asBackground` (the answer and the release, never
  busy), in place of the plan's `afterCommit`. 12 record tests pass, persistence 48/48, lint and typecheck clean.
- 2026-11-10 00:23 Step 2: `IdempotencyInterceptor` and `@Idempotent` (innermost: listed first) on the 7 saves; the commit marker
  in `UnitOfWork.commitAsync` (before COMMIT, holder checked; `IdempotencyClaimLostError` → 409 save-in-progress);
  `TypedProblemException` (type, Retry-After, `resource`); `saves.*` messages (en, fr). 16 HTTP tests on the real
  controllers and Postgres: each save once, replays through `@Created`/`@ETagged`, 422, refusal frees the key, busy
  within one 500 ms wait with nothing claimed, failure after commit not run again, takeover → one commit, caller gone
  → key freed. A test bug found on the way (the failure switch fired on the claim's commit). Suite 333/333 twice; lint
  override for the test, as data-scope.test.ts has.
- 2026-11-10 00:27 Step 3 code: `useSaveKey` (`nextSaveKey` unit-tested: kept until a save is done), the key on the customer
  create/edit, part edit and part dialog saves; `saveErrorMessage` (no answer → "could not confirm", in progress →
  "still going through"); went-through: an edit shows what the first save stored ("Your first save went through…"), a
  create opens the record with `?first-save-went-through`; a ref ignores a second press in flight. `ErrorAlert
during="save"` now means a keyed save (its only user is the part dialog). Web typecheck, lint, 93 unit tests pass.
  Not ticked: the browser check needs the running system rebuilt (it runs the `start:prod` build from before).
- 2026-11-10 00:29 Step 4 specs: `web/e2e/save-again.spec.ts`, six journeys (answer lost after the API: once; changed phone → went
  through, opens with the first phone; dropped before sending, changed → saved once; double click → one; part with a
  photo → one photo, no 412; dialog → one part), typecheck and lint clean, not yet run. Step 5: `contracts.md`
  (Idempotency-Key answers), `api-errors.md` (three types, extension members, `@Idempotent` first), `database.md`
  (technical table), `web-architecture.md` (the form's key); `docs:check` 53/53.
