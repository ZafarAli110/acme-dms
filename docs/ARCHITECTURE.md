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
| `gateway-api`    | .NET 10, YARP, EF Core        | routing `/api/<service>/…`; the browsers' sign-ins     | `gateway`    |
| `web`            | React 19, MUI, TanStack Query | the dealership UI                                      | —            |

Rules:

1. **Each service owns its data.** No service reads another service's database. Ask it over HTTP, or listen to its
   events.
2. **Everything goes through the gateway.** The web app only knows `/api/<service>/…`.
3. **Every request is authenticated** with an identity-api token (RS256, validated against identity-api's JWKS),
   except health checks. The user's selected location travels in `x-location-id`. A token lives 15 minutes. The web app
   never holds one: the gateway adds it from the browser's session ("Signing in" below).
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
| rest-clients                | `Acme.<X>.RestClients`                | `src/rest-clients/`                |

See `standards/business-handlers.md` for how a use case is built, and the other standards for the rules each area
follows.

## Signing in: the gateway keeps the sign-in

The web app holds no token. The gateway is its backend (the "backend for frontend" pattern): it signs the browser in at
identity-api, keeps what identity-api issues in a session of its own, and gives the browser only that session's id, in a
cookie. Scripts and tests call the services with a token of their own, as before.

**Signing in.** The page posts the email and password to `POST /api/session` (the gateway), which asks identity-api
(`POST /v1/tokens`). identity-api checks the password and issues:

- **The access token**: a signed JWT, what every service checks. It lives **15 minutes** (`TokenSettings.LifetimeSeconds`)
  and carries `sid`, the id of this sign-in.
- **The refresh token**: 256 random bits, in identity-api's `acme_refresh` cookie, which the gateway reads. identity-api
  keeps only its SHA-256 (`refresh_tokens`), so a copy of that table signs no one in. The sign-in lasts **at most 8 hours**
  (`RefreshLifetimeSeconds`) however often it is renewed.

The gateway keeps both in its own database (`gateway`, table `sessions`), **encrypted with a key derived from the session
cookie's value** (HKDF, then AES-GCM), and finds the row by that value's SHA-256: a copy of the table holds no token anyone
can use. The browser gets **`acme_session`**: 256 random bits, `HttpOnly` (out of reach of the page's scripts),
`SameSite=Strict`, `Path=/api`, `Secure` everywhere but local development, and no expiry (gone when the browser closes).
The answer is 204 with the cookie, or identity-api's own refusal (401, or 429 with `Retry-After`) as it gave it.

**Every request.** A request to `/api/…` with the cookie is sent on with the session's access token (`Authorization:
Bearer`, `SessionMiddleware`), and **without the session cookie**, whose value is the key to the session's tokens: it
never goes past the gateway. The services check the token's signature and expiry, as before. Within a minute of its
expiry the gateway first renews it (`POST /v1/tokens/refresh`), **one renewal per session at a time on every gateway
instance**, with no transaction held across the call to identity-api: a renewal takes a lease on the session
(`renewing_until`, one short `UPDATE` that only one request can win), calls identity-api, then saves the new tokens and
gives the lease back. A request that finds a renewal running sends the token it has while that still works, and
otherwise waits for it; a lease left by a gateway that stopped runs out after 20 seconds. A renewal runs to the end on
its own time limit, not the browser's: a tab closed midway must not leave the session holding a refresh token
identity-api has already replaced. If identity-api cannot be reached, a token that has not yet expired is still sent;
signing in then answers 503. A renewal **reads the person's roles and locations again**, so a change Maria makes on the
Locations page reaches a signed-in person within 15 minutes, and a person who was deleted cannot renew. When
identity-api has ended the sign-in, the gateway deletes the session and answers 401 with `X-Acme-Session: ended`; on
that answer only, the page goes to the sign-in page (a service's own 401 is an error to show, not a sign-out). Signing
in again ends the session the browser had. A request without the cookie is sent on as it came: a script's own token
reaches the services unchanged.

**Requests made from another site.** The browser sends the cookie with every request to `/api`, so the gateway refuses
(403) a request that changes something (anything but `GET`, `HEAD` and `OPTIONS`), and any sign-in or sign-out, without
the header `X-Requested-With: acme-web`. A form or a link on another site cannot add it; `SameSite=Strict` is the other
half of that defence.

**Rotation and reuse.** Every renewal replaces the refresh token, and the tokens of one sign-in form a chain (`family_id`,
the `sid`). A token that was already replaced and is shown again is a copy in another hand: after a short grace period
(`RefreshReuseGraceSeconds`, 20 s, for a second request racing the first) **the whole chain is revoked**. Inside the grace
period the replay gets an access token and **no new refresh token**. identity-api takes a sign-in's rows one request at a
time (`SELECT … FOR UPDATE`), so a sign-out cannot slip between a renewal's read and its insert and leave the new token
live. A replaced token is kept for an hour (to tell a copy from the owner) and then deleted.

**Signing out.** `DELETE /api/session` deletes the session, removes the cookie and tells the browser to drop what it cached
(`Clear-Site-Data: "cache"`): **from the next request on, that cookie signs no one in**, a copy of it included, on every
gateway instance. A stream already open (an export's progress) runs on: its token was checked when it opened. The gateway then asks identity-api to revoke the chain
(`POST /v1/tokens/revoke`); that can fail without harm, because nothing outside the deleted session had the refresh
token. If the page cannot reach the gateway the cookie is still good, so the sign-out is remembered in `localStorage`
(`acme.revokePending`) and the next load ends that sign-in first and signs no one in with it. Unknown email and wrong
password cost the same time at sign-in (a hash is checked either way).

**An access token is not taken back (a decision).** Signing out of the browser is immediate, because the session is
deleted and its token never reached the browser. An access token itself stays good until it expires, **at most 15 minutes**:
the services check its signature and expiry, ask identity-api nothing about a request, and keep no list of ended sign-ins.
This is the usual trade for short-lived signed tokens, and it is chosen on purpose:

- **What it costs.** When identity-api ends a sign-in on its own (a refresh token shown again, a person deleted), the
  session's last access token keeps working until it expires; so does a token a script holds after its sign-in ends.
- **What it buys.** Nothing on a service's request path but the signature check; identity-api being down stops only signing
  in and renewing; no background traffic between the services.
- **When to change it.** If a customer or an audit needs removing a person to take effect at once, the services must refuse
  ended sign-ins: a list kept in memory, filled from identity-api when a service starts and then by events, with
  identity-api keeping a revoked sign-in listed for as long as its access tokens can live. Shortening the token instead (say
  5 minutes) narrows the window at the cost of more renewals.

**Guessing passwords.** Two limits, because each stops what the other cannot: **per address** (10 sign-ins and 120
renewals a minute: ASP.NET's rate limiter, answering 429 with `Retry-After`), and **per account** (`SignInThrottle`: after 5
wrong passwords in a row for one email, from any addresses, the next attempts wait 30 s, then 60 s, doubling to 15 minutes,
until a right password or 30 quiet minutes; an email nobody has is counted the same, so the wait does not say which exist).
The address is the browser's, as the gateway forwards it (`X-Forwarded-For`, one hop trusted, the gateway's, also on the
sign-ins and renewals it makes for a browser: a client cannot choose its own by sending the header); **do not expose
identity-api to the internet directly**, because then that header would be the client's. Both are in memory, so each
instance of identity-api counts for itself. Behind a load balancer the gateway must take the browser's address from it
(`UseForwardedHeaders`, trusting that hop only); otherwise every browser has the balancer's address and shares one limit.

What this does not do, on purpose:

- **Script on the page can still call the API while the page is open**, as the person, for as long as it runs: the browser
  sends the cookie with its requests. It cannot take the cookie away to use elsewhere (`HttpOnly`), and there is no token in
  the page to take.
- **One database read per request** at the gateway, by primary key, to find the session; a renewal adds a call to
  identity-api about every 14 minutes for each person who keeps working.
- **The limits are per instance of identity-api.** A shared store (Redis, or the database) would make them exact across
  instances; with one instance, or a few, an attacker still gets a small fraction of the guesses.
