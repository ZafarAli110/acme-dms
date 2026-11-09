# API errors

Every error response from every service is RFC 9457 problem details, content type `application/problem+json`, with
exactly these fields (always present; `null` when unknown):

```json
{
  "type": "urn:acme:error:not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Part 3eb1… was not found.",
  "instance": "/v1/parts/3eb1…",
  "location": "20000000-0000-0000-0000-000000000001",
  "userId": "30000000-0000-0000-0000-000000000001",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "timestamp": "2026-10-28T09:15:00.000Z"
}
```

| `type`                               | status |
| ------------------------------------ | ------ |
| `urn:acme:error:validation`          | 400    |
| `urn:acme:error:unauthorized`        | 401    |
| `urn:acme:error:forbidden`           | 403    |
| `urn:acme:error:not-found`           | 404    |
| `urn:acme:error:conflict`            | 409    |
| `urn:acme:error:too-many-requests`   | 429    |
| `urn:acme:error:internal`            | 500    |
| `urn:acme:error:service-unavailable` | 503    |
| `urn:acme:error:busy`                | 503    |
| `urn:acme:error:save-in-progress`    | 409    |
| `urn:acme:error:save-went-through`   | 409    |
| `urn:acme:error:idempotency-key`     | 422    |

- **Extension members** (RFC 9457) follow the standard ones, only on the type that defines them: `save-went-through`
  carries `resource`, where the saved record is read (`/v1/customers/{id}`), `null` when not known. A type more precise
  than its status is thrown as `TypedProblemException` (`service/problem-details/`), with its `Retry-After` and members.
- Unexpected errors (500) never expose internals: `detail` is "An unexpected error occurred". The real error is in the
  logs and the trace — search the dashboard for the `traceId`.
- 4xx errors are logged as warnings, 5xx as errors.
- NestJS: `service/filters/problem-details.filter.ts`. .NET: `Acme.ServiceDefaults/ProblemDetails/`.

## Saving a record someone else changed: ETag, If-Match, 412 (dealership-api)

A record people edit (a customer, a part) has a `version`, one more with every save. It is the record's ETag (`"7"`).

- `GET` of one record, and every save, answers with `ETag`. A `GET` with `If-None-Match` naming it answers `304` with
  no body. That `GET` is the one answer a browser may keep, and only to ask again: `Cache-Control: private, no-cache`
  (`Vary: authorization, cookie, x-location-id`: a script's token, the browser's session cookie), so the browser sends
  `If-None-Match` itself. The server still runs the query and checks who is asking before it says 304: this saves the
  body, not the work. Every other answer, saves included,
  stays `Cache-Control: no-store` (one dealer's data, one user's: nothing is kept).
  After a sign-out the sign-in page asks the browser to drop what it kept: the gateway's `DELETE /api/session/cache`
  answers with `Clear-Site-Data: "cache"`, on a request nobody waits for (a browser holds that answer back while it
  clears); one answer saying it is enough, so no service repeats it (Chrome, Edge and Firefox, on
  HTTPS or localhost; Safari ignores it, and there a kept copy is still only shown after the service agrees, which needs
  a signed-in session).
- A save (`PUT`, `PATCH`) sends `If-Match` with the version it started from: `428` without it, `412` when it is not
  the current version. The handler checks the version in the same `UPDATE` (`where … version = …`, `version + 1`), so
  two saves from one version can never both win; with files, it checks before uploading too.
- The web app's form sends the version it was opened with, never one refetched since: the edit pages remount the form
  when the record changes.
- In code: `@ETagged()` on the endpoint, `@IfMatchVersion()` for the version (`service/concurrency/record-version.ts`).

## Saving again is safe: Idempotency-Key (dealership-api, ACME-125)

A save whose answer was lost (a timeout, a dropped connection) may or may not have gone through. Every save that adds or
changes a record takes an `Idempotency-Key` and is done once per key (`docs/contracts.md` has the answers).

- In code: `@Idempotent("created" | "path" | "none")`, **listed first** on the method, above `@Post`/`@Put` and every
  other decorator: Nest runs the last-listed interceptor innermost, and it must be innermost so the files are read for
  its fingerprint and a replayed answer still passes through `@Created` and `@ETagged`. The argument says where the
  saved record is read: an add's `@Created` Location, a change's own path, or none.
- The key is claimed in a transaction of its own before the save; the save's own transaction marks it committed just
  before COMMIT (`UnitOfWorkFactory`), so a key is committed exactly when its save is. A second save that took the key
  over (the first ran past its 60 s lease) leaves the first unable to commit: one of them saves, never both.
- The answer is kept after the save, and a failed save's key freed, as background work that is never "busy" and
  outlives a caller who left. The claim spends the save's one connection wait: a busy system still answers 503 within
  it, with nothing claimed.
- A new save endpoint gets `@Idempotent`, and a test that sends it twice with one key.

## Messages in the user's language (dealership-api)

`detail`, and every other message a person reads, comes in the language the request asks for (`Accept-Language`,
which the web app sets to the language the user chose): English or French, English for anything else.

- Throw with a catalog key, never a sentence: `new NotFoundException(localized("errors.customerNotFound", {
customerId }))` (`#i18n/messages`). The exception's own message stays English, so logs, traces and tests read
  English; the problem-details filter sends the request's language.
- A new message goes into both catalogs, `src/i18n/catalogs/en.ts` and `fr.ts`, under the same key with the same
  `{placeholders}`. The types refuse a key English lacks; `i18n/__test__/catalogs.test.ts` refuses a French message
  that is missing or loses a placeholder.
- Validation messages are the catalogs' `validation.*` (`isNotEmpty`, `maxLength`, …). Valibot's rules are mapped to
  them in one place, `toValidationMessage` (`service/validation/valibot-pipe.ts`): a new kind of rule (a new Valibot
  action) gets its case there and in `service/swagger/valibot-openapi.ts`, and a test in `request-schemas.test.ts`. `{property}` shows the field under its screen
  name (`fields.*`); add a new field there.
- A message stored to be read later (an export's failure) is stored as its key and translated when it is read.
- document-api and identity-api (.NET) still answer in English; a refusal of theirs is passed on as they wrote it.

## Database errors

A query that breaks a database rule is not an unexpected error: the client gets a status it can act on and a message
in plain words, never SQL, a table or a constraint name. Both stacks use the same table (NestJS:
`service/problem-details/database-error.ts`; .NET: `Acme.ServiceDefaults/DatabaseErrors/`).

| SQLSTATE                                                             | Status | `detail`                                                                    |
| -------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `23505` unique violation                                             | 409    | A record with the same value already exists.                                |
| `23503` foreign key violation                                        | 409    | This refers to a record that does not exist, or the record is still in use. |
| `23502`, `23514`, `22001`, `22P02` (missing, invalid or too long)    | 400    | A value is missing or not allowed.                                          |
| `40001`, `40P01` (serialisation failure, deadlock)                   | 409    | The record was changed at the same time by someone else. Try again.         |
| `57014`, `55P03`, `53300`, `57P01`, `57P03`, class `08` (busy, down) | 503    | The database is busy or unavailable. Try again shortly.                     |
| anything else                                                        | 500    | An unexpected error occurred                                                |

- A unique rule the user can break has its own message, by index name: `uq_parts_dealer_part_number` says "A part
  with this part number already exists in your catalogue." Add one next to the index when you add the index.
- Handlers still check a rule first when they can give a better message (`existsWithPartNumberAsync`). The database
  rule is what holds when two requests race past that check.

## Errors with a cause

When you catch an error and throw another, keep the original as its cause: `new ConflictException(message, {cause})`
in TypeScript, `new ApiException(category, message, innerException)` in C#. The log line follows the chain up to
three causes deep (`MAX_ERROR_CAUSE_DEPTH`, `ExceptionChain.MaxCauseDepth`), with the SQLSTATE and constraint of a
failed query; the response shows none of it.
