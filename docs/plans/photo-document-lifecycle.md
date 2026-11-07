# Plan: a part photo always ends ready or failed

Branch: `main` first, then every lab and `final` (the pipeline differs by a few lines between them). PHOTO-3, the ETag,
is on `final` only. Part of [implicit state machines](implicit-state-machines.md).

## Why

A photo is one state machine that crosses two services and a message broker:

```
web upload → dealership-api stores the file in document-api → inserts part_photos (pending)
document-api processes it → outbox → RabbitMQ → dealership-api consumer → part_photos (ready | failed)
web polls GET /parts/:id every 2 s while a photo is pending
```

Nothing declares the moves, and four gaps each leave a photo `pending` for good, with the page polling forever:

- **PHOTO-1, an early event (checked).** `upload-part-photo.command-handler.ts:61` stores the document _before_ the
  photo row is inserted (`:70-84`); `update-part.command-handler.ts:114-134` uploads every file before its transaction.
  `mark-part-photo-ready.command-handler.ts:46-50` updates by `documentId`, never reads the row count, commits the inbox
  row, and the consumer acks (`document-events.consumer.ts:130`). An event that wins the race is gone.
- **PHOTO-2, no starting state (checked).** Ready and failed update whatever is there: `failed` after `processed` (two
  message ids, so the inbox does not help) leaves the last one; soft-deleted photos change too (the consumer works as
  the table owner).
- **PHOTO-3, a cache that can't see the change (checked, `final`).** The part GET is `@ETagged` from `parts.version`
  with `Cache-Control: private, no-cache` (`etag.interceptor.ts:44`); only `update-part` bumps `version`. The web fetch
  sets no `cache` option (`apiClient.ts:172`), and the gateway passes the headers through. So the browser revalidates
  every poll, gets `304`, and hands back the cached `pending` body. Stock and bin changes are hidden the same way.
- **DOC-2, an unconfirmed republish (checked).** `ProcessDocumentConsumer.cs:46` opens its channel with
  `publisherConfirms: false`, republishes, then acks the original. A dropped republish leaves the document `Pending`.

And around them:

- **DOC-1 (checked in part).** Process and Fail check `Status == Pending` on a tracked read with no lock or token
  (`ProcessDocumentCommandHandler.cs:53`, `FailDocumentCommandHandler.cs:35`). A Delete in between (the documented undo
  of an upload) is overwritten: the deleted document becomes Ready and `document.processed` goes out. Delete itself
  turns into `EntityState.Modified` (`AuditingInterceptor.cs:63`), which writes every column from its snapshot, so a
  slower Delete puts `Status` back to `Pending` after Ready was published.
- **PHOTO-4 (traced).** The photo count and the default flag are read in their own read-only transaction
  (`upload-part-photo…:89-98`): two uploads at once make two defaults, or pass 10.
- **PHOTO-5 (traced).** Any handler error is dead-lettered at once (`document-events.consumer.ts:136`); nothing reads
  the dead-letter queue. A database blip loses the photo's update.
- **PHOTO-6 (traced).** A crash between the upload and the insert orphans the document; nothing cleans it up.
- **DOC-3 (traced).** `OutboxRelay.cs:47-51` takes 50 rows with no `FOR UPDATE SKIP LOCKED` and saves once per batch
  (`:85`): two instances publish the same rows, a failure republishes the batch's earlier rows every second, and a
  poison row blocks the outbox for good.
- **Also:** no `CHECK` on `part_photos.status` or `documents.status`; `processed_messages` and outbox rows are never
  pruned; a retried upload makes a second document (no idempotency key); a part deleted while processing still has its
  photo updated; events published before dealership-api first declared its queue are dropped (`mandatory: false`).

## The machines, declared

**part_photos**

| From → to                      | Trigger                                     | Guard                                                                                              |
| ------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| none → `pending`               | upload commits                              | the part row locked `FOR UPDATE`; count and default read under that lock                           |
| `pending` → `ready` / `failed` | `document.processed` / `document.failed`    | `WHERE document_id = $1 AND dealer_id = $2 AND status = 'pending' AND NOT is_deleted RETURNING id` |
| `pending` → `failed`           | the photo sweep, after the pending deadline | the same conditional UPDATE; reason "timed out"                                                    |
| `ready` / `failed` + an event  | none                                        | ack, log at information as stale                                                                   |
| any → deleted                  | the user's save                             | unchanged                                                                                          |

**documents**: `Pending → Ready | Failed` only by a conditional update (or `xmin` as a concurrency token, skipping on
`DbUpdateConcurrencyException` with no outbox row). Delete writes only the delete and audit columns
(`ExecuteUpdateAsync`), never `Status`.

## Decisions

1. **An event for a row that is not there yet is retried, not acked.** When the guarded UPDATE changes 0 rows, read the
   row: there and finished → ack as stale; there and deleted → ack; not there → do not commit the inbox row, republish
   with an `x-attempt` header and back off (the pattern `ProcessDocumentConsumer` already uses), dead-letter after 5.
   The same path retries any other handler error (PHOTO-5).
2. **A pending photo has a deadline and an owner.** `pending_until` (10 minutes) on the row; a photo sweep in
   dealership-api, shaped like the export worker's `sweepAsync`, marks it `failed` with reason "timed out" and prunes
   `processed_messages` older than 30 days. document-api gets the same for `Pending` documents (re-enqueue, then fail).
3. **The part GET's ETag covers what it shows.** A weak ETag from the body (`W/"<version>-<hash>"`); `If-Match` keeps
   using `version`. Not a version bump on processing: that would turn the open edit form's next save into a `412`.
   Belt and braces: the photo poll asks with `cache: "no-store"`.
4. **Two uploads take turns.** Lock the part row in the insert's transaction and count there; a partial unique index
   `uq_part_photos_default ON part_photos(part_id) WHERE is_default AND NOT is_deleted`.
5. **The outbox publishes each row once.** Read under `FOR UPDATE SKIP LOCKED` in a transaction, save after each
   confirmed publish, and an `attempts` column that parks a row after 10 failures with an error log.
6. **The processing consumer confirms before it acks**: `publisherConfirms: true`; the Fail call is wrapped so the
   message is always acked or nacked.
7. **The values are checked by the database**: `CHECK (status IN ('pending','ready','failed'))` and
   `HasCheckConstraint("ck_documents_status", …)`.
8. **The web stops polling** after 2 minutes and says the photo is still being processed; `failed` shows its reason on
   the tile, not only in a tooltip.

Left for later: the orphaned document after a crash (PHOTO-6) needs document-api to expire unclaimed documents, a
design of its own; the upload idempotency key; `mandatory: true` with a declared queue at document-api's start.

## Tests (each fails today)

- `mark-part-photo-ready…/__test__`: the event before the row → retried, inbox empty, ready after the replay; ready then
  failed → stays ready; a soft-deleted photo → unchanged.
- `upload-part-photo…/__test__`: two uploads at once on an empty part → exactly one default; 9 photos and two uploads
  at once → one refused.
- `service/interceptors/__test__/etag.interceptor.test.ts` (new, `final`): GET, mark ready, GET with `If-None-Match`
  → `200` with `ready`.
- the photo sweep: a photo pending past its deadline → `failed`, "timed out" (`fixedClock()`).
- `ProcessDocumentCommandHandlerTests`: a delete between the read and the save → no `DocumentProcessed` outbox row,
  still deleted. `DeleteDocumentCommandHandlerTests`: a delete after Ready → still Ready.
- `OutboxRelayTests` (new): a poison row does not republish the rows before it; two relays never publish one row twice.
- `schema.test.ts`: `status = 'bogus'` is refused.
