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

The gateway keeps both in its own database (`gateway`, table `sessions`), **encrypted with a key derived from the
session cookie's value** (HKDF, then AES-GCM), and finds the row by that value's SHA-256: a copy of the table holds no
token anyone can use. The browser gets **`__Host-acme_session`** (`acme_session` in local development, which is plain
HTTP): 256 random bits, `HttpOnly` (out of reach of the page's scripts), `SameSite=Strict`, `Secure`, `Path=/` and no
`Domain` (what the `__Host-` prefix requires, so a sibling subdomain cannot plant a cookie of its own), and no expiry
(gone when the browser closes). Outside development the gateway also sends HSTS, so the browser keeps to HTTPS. The
answer is 204 with the cookie, or identity-api's own refusal (400, 401, or 429 with `Retry-After`) as it gave it; any
other answer from identity-api, or none, is a 503.

**Every request.** A request to `/api/…` with the cookie is sent on with the session's access token (`Authorization:
Bearer`, `SessionMiddleware`), and **without the session cookie**, whose value is the key to the session's tokens: it
never goes past the gateway. The services check the token's signature and expiry, as before. Within a minute of its
expiry the gateway first renews it (`POST /v1/tokens/refresh`), **one renewal per session at a time on every gateway
instance**, with no transaction held across the call to identity-api: a renewal takes a lease on the session
(`renewing_until`, one short `UPDATE` that only one request can win, timed by Postgres's clock so the instances' own
clocks do not matter), calls identity-api, then saves the new tokens and gives the lease back, both only while the lease
is still its own. A request that finds a renewal running sends the token it has while that still works, and otherwise
waits for it. A renewal has 10 seconds, on its own time limit rather than the browser's; when no answer comes it asks once
more at once, with 4 seconds, because identity-api may have replaced the token and lost the answer, and asked again
inside its 20-second grace period it gives the same replacement (see "Rotation and reuse"). The lease lasts 15 seconds,
longer than both calls and shorter than the grace, so after a gateway that stopped mid-renewal the next request can
ask again inside the grace. Past the grace, a renewal is still recognised by its **renewal key**: the gateway makes one
with a renewal's first lease, keeps it on the session until a renewal succeeds, and sends it as `Idempotency-Key`;
identity-api stores it with the token it replaced, and the same old token with the same key gets the same unused
replacement however late it comes. Shown without the key (a copy of the old token), it still ends the sign-in. If identity-api
cannot be reached, a token that has not yet expired is still sent; otherwise the gateway answers 503. A renewal **reads
the person's roles and locations again**, so a change Maria makes on the Locations page reaches a signed-in person
within 15 minutes, and a person who was deleted cannot renew. When identity-api has ended the sign-in, the gateway
deletes the session and answers 401 with `X-Acme-Session: ended`; on that answer only, the page goes to the sign-in page
(a service's own 401 is an error to show, not a sign-out). Signing in again ends the session the browser had. A request
without the cookie is sent on as it came: a script's own token reaches the services unchanged.

**Requests made from another site.** The browser sends the cookie with every request to `/api`, so the gateway refuses
(403) a request that changes something (anything but `GET`, `HEAD` and `OPTIONS`), and any sign-in or sign-out, without
the header `X-Requested-With: acme-web`. A form or a link on another site cannot add it; `SameSite=Strict` is the other
half of that defence.

**Rotation and reuse.** Every renewal replaces the refresh token, and the tokens of one sign-in form a chain
(`family_id`, the `sid`). A token that was already replaced and is shown again is a copy in another hand: after a short
grace period (`RefreshReuseGraceSeconds`, 20 s) **the whole chain is revoked**. Inside the grace period it is taken for
the same caller asking again (an answer that was lost, or two requests at once): it gets an access token and **the same
replacement** the first request got, while that replacement is unused, so a lost answer costs nothing. identity-api
keeps that replacement sealed with a key only the replaced token gives (`next_token_sealed`), so the table still holds
nothing anyone can use. A copy used inside the grace ends up with the same replacement as its owner: whichever uses it
second shows a replaced token after the grace, and the chain is revoked. identity-api takes a sign-in's rows one request
at a time (`SELECT … FOR UPDATE`), so a sign-out cannot slip between a renewal's read and its insert and leave the new
token live. A replaced token is kept for an hour (to tell a copy from the owner) and then deleted.

**The signing keys.** identity-api signs access tokens with RSA (`RS256`): it holds the private key, and every other
service checks signatures with the public key from its JWKS (`/.well-known/openid-configuration`), so no service can
make a token. The keys are in the identity database (`signing_keys`), **encrypted with ASP.NET Data Protection**, whose
own keys live outside that database (`DataProtection__KeysPath`: a folder in the user's profile in development, a path
every identity-api instance shares, or a key vault, in production), so a copy of the database cannot sign a token.
**They rotate**: a key signs for 30 days; an hour before that, the next key is made and published, so every service
already knows it when it takes over; the old key stays published for 1 hour 15 minutes more, longer than any token it
signed can live, and is then deleted. Each identity-api instance reads the keys every 5 minutes, and one at a time (a
Postgres advisory lock) makes the next key. A key kept unencrypted from before is encrypted the first time identity-api
loads it.

**A key no instance can open.** Every key is published from its public half, kept beside it, so an instance whose Data
Protection keys cannot open a key still publishes it. Outside Development such a key is never deleted automatically:
two instances with different Data Protection keys would otherwise delete each other's. An instance that cannot open the
key in use logs it at error, cannot sign, and its health answers 503, so it is taken out of service. When no instance
can open it (the Data Protection keys were lost), a person replaces it, once, from a machine with the Data Protection
keys every instance shares:

```
dotnet run --project backend/identity-api/src/Acme.Identity.Service -- replace-signing-keys
```

with the same `ConnectionStrings__identity` and `DataProtection__KeysPath` as the service (in PowerShell, set them with
`$env:NAME = "…"` first). It deletes the keys those Data Protection keys cannot open, makes a key that signs at once, and
exits. Tokens the old key signed stop verifying, so everyone signs in again. In Development an instance replaces such a
key on its own (a developer who deleted their profile's folder).

**Signing out.** `DELETE /api/session` deletes the session, removes the cookie and tells the browser to drop what it
cached (`Clear-Site-Data: "cache"`): **from the next request on, that cookie signs no one in**, a copy of it included,
on every gateway instance. A stream already open (an export's progress) runs on: its token was checked when it opened.
The gateway then asks identity-api to revoke the chain (`POST /v1/tokens/revoke`); that can fail without harm, because
nothing outside the deleted session had the refresh token. If the page cannot reach the gateway the cookie is still
good, so the sign-out is remembered in `localStorage` (`acme.revokePending`) and the next load ends that sign-in first
and signs no one in with it. The page keeps its screen, with the dialog saying it is signing out, until the gateway has
answered; then every open tab loads the sign-in page afresh (a full navigation, so no data or form of the old sign-in
survives), even one with unsaved changes, which nothing could save any more. Unknown email and wrong password cost the same time at sign-in (a hash is checked either
way).

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
renewals a minute: ASP.NET's rate limiter, answering 429 with `Retry-After`; an IPv6 address is counted by its /64, the
network one home or office gets, so switching addresses inside it gains nothing), and **per account** (`SignInThrottle`:
after 5 wrong passwords in a row for one email, from any addresses, the next attempts wait 30 s, then 60 s, doubling to
15 minutes, until a right password or 30 quiet minutes; an email nobody has is counted the same, so the wait does not
say which exist). The address is the browser's, as the gateway forwards it (`X-Forwarded-For`, one hop trusted, the
gateway's, also on the sign-ins and renewals it makes for a browser: a client cannot choose its own by sending the
header); **do not expose identity-api to the internet directly**, because then that header would be the client's. Both
are in memory, so each instance of identity-api counts for itself. Behind a load balancer, name it in
`ForwardedHeaders__KnownProxies`: the gateway then takes the browser's address from it (`UseForwardedHeaders`, that hop
only). Without it every browser has the balancer's address and shares one limit.

What this does not do, on purpose:

- **Script on the page can still call the API while the page is open**, as the person, for as long as it runs: the browser
  sends the cookie with its requests. It cannot take the cookie away to use elsewhere (`HttpOnly`), and there is no token in
  the page to take.
- **One database read per request** at the gateway, by primary key, to find the session; a renewal adds a call to
  identity-api about every 14 minutes for each person who keeps working.
- **The limits are per instance of identity-api.** A shared store (Redis, or the database) would make them exact across
  instances; with one instance, or a few, an attacker still gets a small fraction of the guesses.
