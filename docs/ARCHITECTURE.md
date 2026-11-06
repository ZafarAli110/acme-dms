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

`POST /v1/tokens` (identity-api) checks the password and answers with two tokens:

- **The access token** (a signed JWT) is what every request sends. It lives **15 minutes** (`TokenSettings.LifetimeSeconds`):
  a copied one stops working soon, and the services still need nothing but identity-api's public keys to check it.
- **The refresh token** is 256 random bits. identity-api keeps only its SHA-256 (`refresh_tokens`), so a copy of the table
  signs no one in. It lasts **at most 8 hours from signing in** (`RefreshLifetimeSeconds`).

The web app's API client does the rest. A 401 for a token it sent means the token expired: it posts the refresh token to
`POST /v1/tokens/refresh`, gets a new access token, and sends the request again, once, for all requests that found it
expired together. A refresh **reads the person's roles and locations again**, so a change Maria makes on the Locations
page reaches a signed-in person within 15 minutes, and a person who was deleted cannot refresh. When identity-api refuses
the refresh token, the sign-in is over: the app clears the session and shows the sign-in page.

Signing out calls `POST /v1/tokens/revoke`: the refresh token is never accepted again, so the access token it made is the
last, and it ends within 15 minutes. The service answers 204 for any token, so signing out cannot fail.

What this does not do, on purpose:

- **No rotation.** The refresh token is not replaced at each use. The app's tabs share one sign-in (`sessionStore.ts`),
  and rotating a token several tabs hold needs a lock across them; without it, two tabs refreshing at once would look like
  a stolen token. The cost: a leaked refresh token works until it is revoked or its 8 hours end. Add rotation with reuse
  detection together with a cross-tab lock (the Web Locks API) when that matters.
- **Both tokens are in `sessionStorage`**, readable by a script on the page, as the access token always was. A production
  deployment would keep the refresh token in an `httpOnly` cookie set by identity-api.
- **An access token cannot be taken back.** Revoking ends the sign-in, not the token already issued: that one works until
  it expires, at most 15 minutes.
