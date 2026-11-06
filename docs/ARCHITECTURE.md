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
(`RefreshReuseGraceSeconds`, 20 s, for the same person's second request racing the first, such as an answer that was lost)
**the whole chain is revoked**, the owner's newest token with it. Inside the grace period the replay gets an access token
and **no new refresh token**, so a copy used in that window gets 15 minutes and nothing that lasts. A refresh, another
refresh of the same sign-in and a sign-out take the sign-in's rows one after the other (`SELECT … FOR UPDATE`), so a sign-out
cannot slip between a refresh's read and its insert and leave the new token live. Across tabs one refresh runs at a time (the
Web Locks API), and a sign-out waits for it, because each refresh replaces the cookie every tab shares. A replaced token is
kept for an hour (to tell a copy from the owner) and then deleted, so a sign-in is a handful of rows.

**Signing out and recall.** `POST /v1/tokens/revoke` revokes the whole chain and removes the cookie; it answers 204 for any
token, so signing out cannot fail on the service's side. If the web app cannot reach the service the cookie is still good,
so the sign-out is remembered in `localStorage` (`acme.revokePending`) and the next load ends that sign-in first and signs no
one in with it. The access token that is left does not live out its 15 minutes, and no request asks identity-api anything:

- identity-api lists the sign-ins that ended lately (`GET /v1/sessions/revoked?since=`, open to the services: the ids are random
  and say nothing about whose they are; never further back than an access token can live).
- Every service **polls that list every 5 seconds** and keeps the answer in memory for as long as a token can live
  (dealership-api: `RevokedSessionsFeed`; document-api in the shared JWT validation, `Acme.ServiceDefaults`, the same class
  name). Checking a request is a lookup in memory: no network, no waiting, nothing to stampede after a restart, and the cost is
  one small question per service instance, not per person. A sign-out reaches every service within about 5 seconds
  (measured: 3). Each service asks once before it takes requests, and each question starts at the last answer's clock (or at
  the oldest a live token could be), so a long outage still ends in a complete answer.
- **identity-api being down or slow is not a hole.** New sign-ins can only end at identity-api, so while it is down there is
  nothing new to learn; the services keep what they know and keep refusing it. identity-api answers for its own endpoints
  from its database.
- A token with no `sid` is refused: every token identity-api issues has one, and one without could never be ended.
- Unknown email and wrong password cost the same time at sign-in (a hash is checked either way).

**Guessing passwords.** Two limits, because each stops what the other cannot: **per address** (10 sign-ins and 120
refreshes a minute: ASP.NET's rate limiter, answering 429 with `Retry-After`), and **per account** (`SignInThrottle`: after 5 wrong
passwords in a row for one email, from any addresses, the next attempts wait 30 s, then 60 s, doubling to 15 minutes, until a
right password or 30 quiet minutes; an email nobody has is counted the same, so the wait does not say which exist). The address
is the caller's as the gateway forwards it (`X-Forwarded-For`, one hop trusted, the gateway's: a client cannot choose its own by
sending the header); **do not expose identity-api to the internet directly**, because then that header would be the client's.
Both are in memory, so each instance of identity-api counts for itself.

**Renewing before it expires.** The web app fetches the next access token a minute before the one in use expires
(`apiClient.renewBefore`), so a request, a multipart upload above all, is not sent twice. A background tab may run it late;
the 401 path is still there for that.

What this does not do, on purpose:

- **Up to about 5 seconds, not instantly.** That is the polling interval.
- **Script on the page can still call the API while the page is open**, as the person, for as long as it runs: it cannot
  take a token away to use elsewhere (the refresh token is unreachable, the access token is in memory), but httpOnly does
  not stop code running in the page from making requests.
- **A sign-in's access token can outlive the sign-in's 8 hours by up to 15 minutes**: the chain ends by its lifetime, not by a
  revocation, so it is not on the list. A token issued in the last minutes of a sign-in works for its own 15 minutes.
- **The limits are per instance of identity-api.** A shared store (Redis, or the database) would make them exact across
  instances; with one instance, or a few, an attacker still gets a small fraction of the guesses.
