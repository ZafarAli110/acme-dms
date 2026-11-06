# Architecture

Acme DMS is a dealership management system. One deployment serves many clients, each a **dealer** (dealer group),
with its **locations** (physical sites, "rooftops"). Every dealer's data shares the same databases, marked with
`dealer_id`; `standards/multi-tenancy.md` explains what that means for data. People hold a **role per location**; roles grant **permissions**.

## Services

| Service          | Stack                         | Owns                                                   | Database     |
| ---------------- | ----------------------------- | ------------------------------------------------------ | ------------ |
| `identity-api`   | .NET 10, EF Core              | dealers, locations, users, roles; issues access tokens | `identity`   |
| `dealership-api` | NestJS 12, Drizzle            | parts catalogue, stock, part photos (references)       | `dealership` |
| `document-api`   | .NET 10, EF Core              | files and their processed variants                     | `documents`  |
| `gateway-api`    | .NET 10, YARP                 | routing `/api/<service>/…` to the services             | —            |
| `web`            | React 19, MUI, TanStack Query | the dealership UI                                      | —            |

Rules:

1. **Each service owns its data.** No service reads another service's database. Ask it over HTTP, or listen to its
   events.
2. **Everything goes through the gateway.** The web app only knows `/api/<service>/…`.
3. **Every request is authenticated** with an identity-api token (RS256, validated against identity-api's JWKS),
   except health checks. The user's selected location travels in `x-location-id`. A token lives 15 minutes and is
   renewed with a refresh token ("Signing in" below).
4. **Asynchronous work goes through RabbitMQ**, written to an outbox first (see `standards/messaging.md`).

## Inside a service

Both stacks use the same layers, named the same way.

```
service (controllers, consumers, problem details, observability)   ← HTTP and messages come in here
  └─► business-logic-abstractions (handler interfaces, client interfaces, UserContext)
        └─► business-logic (one handler per use case)
              └─► persistence (schema, unit of work, migrations)
dto (request/response contracts)                                    ← used by every layer, depends on nothing
rest-clients (typed clients for other services)                    ← implements abstractions
```

| Layer                       | .NET project                          | NestJS folder                      |
| --------------------------- | ------------------------------------- | ---------------------------------- |
| service                     | `Acme.<X>.Service`                    | `src/service/`                     |
| business-logic-abstractions | `Acme.<X>.BusinessLogic.Abstractions` | `src/business-logic-abstractions/` |
| business-logic              | `Acme.<X>.BusinessLogic`              | `src/business-logic/`              |
| dto                         | `Acme.<X>.DTO`                        | `src/dto/`                         |
| persistence                 | `Acme.<X>.Persistence`                | `src/persistence/`                 |
| messaging (.NET)            | `Acme.<X>.Messaging`                  | `src/service/consumers/`           |
| rest-clients                | (none yet)                            | `src/rest-clients/`                |

See `standards/business-handlers.md` for how a use case is built, and the other standards for the rules each area
follows.

## Signing in: an access token and a refresh token

`POST /v1/tokens` (identity-api) checks the password and answers with:

- **The access token** in the body: a signed JWT, what every request sends. It lives **15 minutes**
  (`TokenSettings.LifetimeSeconds`), and it carries `sid`, the id of this sign-in. The web app keeps it **in memory only**:
  nothing in `localStorage` or `sessionStorage` can sign anyone in.
- **The refresh token** in an **httpOnly cookie** (`acme_refresh`): 256 random bits, out of reach of the page's scripts,
  sent only to `/api/identity/v1/tokens/*` (`Path`) and only from this site (`SameSite=Strict`; `Secure` everywhere but
  local development). identity-api keeps only its SHA-256 (`refresh_tokens`), so a copy of the table signs no one in. The
  sign-in lasts **at most 8 hours** (`RefreshLifetimeSeconds`) however often it is renewed. A refresh and a sign-out also
  need the header `X-Requested-With: acme-web`, which a form on another site cannot add.

**Renewing.** The web app's API client gets a 401 for a token it sent and posts to `POST /v1/tokens/refresh`; the cookie
goes with it. identity-api answers with a new access token **and replaces the refresh token** (a new cookie). The request
is then sent again, once, however many requests found the token expired together. A new tab or a reload has no access
token yet and gets one the same way. A refresh **reads the person's roles and locations again**, so a change Maria makes
on the Locations page reaches a signed-in person within 15 minutes, and a person who was deleted cannot refresh.

**Rotation and reuse.** Every use replaces the refresh token, and the tokens of one sign-in form a chain (`family_id`, the
`sid`). A token that was already replaced and is shown again is a copy in another hand: after a short grace period
(`RefreshReuseGraceSeconds`, 20 s, for the same person's second request racing the first) **the whole chain is revoked**,
the owner's newest token with it. Across tabs one refresh runs at a time (the Web Locks API), because each refresh replaces
the cookie every tab shares.

**Signing out and recall.** `POST /v1/tokens/revoke` revokes the whole chain and removes the cookie; it answers 204 for any
token, so signing out cannot fail. The access token that is left does not live out its 15 minutes: every service asks
identity-api whether a token's sign-in is still open (`GET /v1/sessions/current`, with the token; 401 when it was ended)
and remembers an open answer for **10 seconds**, so a sign-out reaches every service within 10 seconds. dealership-api does
this in its authentication guard (`SessionStatusChecker`); document-api and identity-api in the shared JWT validation
(`Acme.ServiceDefaults`, `ISessionStatusChecker`; identity-api answers from its own database). An ended sign-in is
remembered until its token would have expired.

What this does not do, on purpose:

- **A service cannot check while identity-api is down.** The token, already verified and at most 15 minutes old, is
  accepted until identity-api answers again; revocation resumes with it. A service does not stop serving because the
  sign-in authority restarts.
- **Up to 10 seconds, not instantly.** Each service remembers "open" for 10 seconds.
- **Script on the page can still call the API while the page is open**, as the person, for as long as it runs: it cannot
  take a token away to use elsewhere (the refresh token is unreachable, the access token is in memory), but httpOnly does
  not stop code running in the page from making requests.
- **Tokens issued before a sign-in had an id** (no `sid`) are checked by expiry alone, until they expire.
