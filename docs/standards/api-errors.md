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
