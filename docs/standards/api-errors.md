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

- Unexpected errors (500) never expose internals: `detail` is "An unexpected error occurred". The real error is in the
  logs and the trace — search the dashboard for the `traceId`.
- 4xx errors are logged as warnings, 5xx as errors.
- NestJS: `service/filters/problem-details.filter.ts`. .NET: `Acme.ServiceDefaults/ProblemDetails/`.

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
