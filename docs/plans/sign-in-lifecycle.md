# Plan: sign-in services that never lose a session or a key

Branch: every branch: the identity-api and gateway files are the same on `main`, `final` and all the labs. `main`
first, then the labs and `final`. Part of [implicit state machines](implicit-state-machines.md).

## Why

The refresh chain is explicit and well guarded (a row lock per sign-in, a re-read under it, tested with concurrent
refreshes and a sign-out during a refresh), and so is the gateway's renewal lease (one conditional UPDATE). The gaps are
where a state has no owner, or where a failure is treated as permission to delete.

- **SIGN-1, seeding in every environment (checked).** `identity-api/…/Program.cs:72-75` calls `SeedAsync` with no
  environment check; `IdentitySeeder.cs:9` says "Development only". `RemoveRetiredAsync` hard-deletes every user,
  location and dealer not in `DemoData` (refresh tokens cascade), and `AddMissingAsync` creates the demo users with the
  shared demo password. Two instances starting together collide on the inserts and one fails to start.
- **SIGN-2, an unopenable key is deleted (checked).** `SigningKeyProvider.cs:105-110` deletes any key Data Protection
  can't open, then makes a key that signs at once (no hour published ahead). Two instances with different key folders
  (a per-container path still counts as configured), a container restarted without its volume, or one failed read of
  the folder: the keys are deleted, and two instances go on deleting each other's every 5 minutes. The comment says the
  gateway renews the tokens; it doesn't (it renews by time), and the web app treats a service's `401` as the end of the
  sign-in.
- **SIGN-3, a lost renewal answer (checked).** Renewal starts only when a request comes in the last 60 s of the access
  token (`GetAccessTokenCommandHandler.cs:59`). If identity-api rotated the token but its answer missed the 10 s
  timeout, the gateway returns the old access token (`:118-133`), and recovery needs the next request inside identity's
  20 s grace counted from `RotatedAt`: about 10 s after the timeout. A user reading the page for 30 s is then treated as
  a token thief: the chain is revoked (`RefreshTokenCommandHandler.cs:66-72`), the session deleted (`:141`), and the user
  is on the sign-in page. `docs/ARCHITECTURE.md:85-87` says "the next renewal asks again inside the grace"; nothing
  makes it. The lease runs on Postgres's clock and the grace on identity's.
- **SIGN-4 (traced).** `DeleteSessionCommandHandler.cs:26-33` and `CreateSessionCommandHandler.cs:51-55,69` load the
  session tracked, then `Remove` and save. If another request deleted it first, EF throws a concurrency error, nothing
  maps it, the answer is `500` and the cookie is not cleared ("always 204" broken). On sign-in it also orphans the chain
  identity just issued.
- **SIGN-5 (traced).** `CreateTokenCommandHandler.cs:44` checks the throttle, hashes, then records the failure
  (`:62,68`): parallel guesses all pass. The count is in memory per instance (`SignInThrottle.cs:11`).
- **SIGN-6 (traced).** Sign-in's cleanup (`CreateTokenCommandHandler.cs:80-82`) deletes refresh rows without the chain's
  lock; a refresh in flight then fails `SingleAsync` (`RefreshTokenCommandHandler.cs:60`): `500`, not `401`. The comment
  in `RevokeTokenCommandHandler.cs:8-9` (services ask identity-api whether a sign-in is open) is wrong: they never do.
- **No sweeper anywhere.** Every exit is lazy, driven by traffic: expired sessions go only when someone signs in; an
  idle chain's rows stay for good; a revoked chain stays until that user signs in again.

## The machines, declared

**Gateway renewal**

| From → to                    | Trigger                    | Guard                                            |
| ---------------------------- | -------------------------- | ------------------------------------------------ |
| idle → leased(k)             | a request in the last 60 s | no live lease (conditional UPDATE)               |
| leased(k) → idle, new tokens | identity answers           | the row still carries lease k                    |
| leased(k) → unknown(k)       | timeout or crash           | none                                             |
| unknown(k) → leased(k)       | the next request           | the lease has lapsed; the **same key k** is sent |

**Signing key**: `pending → active → published only → deleted after KeptAfter`, and `unopenable` as a state of its own,
never a reason to delete.

## Decisions

1. **SIGN-1: the seeder runs only in Development**, under `pg_advisory_xact_lock`, with inserts that skip existing
   rows. A one-line fix first; the lock and the inserts with it.
2. **SIGN-2: never delete a key that can't be opened.** Mark it (`unopenable_at`), skip it, log at Error; only a
   person deletes it. When no key can be opened, the health check fails instead of making a new one. A new key is
   always published an hour ahead.
3. **SIGN-3: a renewal is retried by its key, not its age.** The gateway stores an attempt key in the session row and
   sends it as `Idempotency-Key`; identity-api keeps it beside `RotatedAt`. The same old token with the same key, while
   its replacement is unused, gets the same replacement whatever its age; any other key (or none) is reuse. Interim, if
   this waits: on a timeout, retry once at once inside the renewal.
4. **SIGN-4: delete by `ExecuteDeleteAsync`**, so a row already gone is not an error; sign-out always clears the cookie.
5. **SIGN-5: reserve before hashing**, in Postgres (`sign_in_attempts`, `UPDATE … SET failures = failures + 1 …
RETURNING blocked_until` first, reset on success), shared by every instance.
6. **SIGN-6: a row gone under the lock is `401`** (`SingleOrDefaultAsync`); correct the comment.
7. **A sweep** in identity-api and the gateway (a hosted service, hourly, under an advisory lock): expired sessions,
   finished chains past a retention, retired keys.
8. **The docs say what the code does**: `docs/ARCHITECTURE.md`, "Signing in".

## Tests (each fails today)

- identity-api, a Program test: started as Production with a user who is not demo data → the user is still there, and
  no demo email exists.
- `SigningKeyProviderTests`: two providers with different Data Protection rings on one database → the other's key
  survives.
- `GetAccessTokenCommandHandlerTests`: identity commits, the gateway times out, the clock moves 30 s, a request → the
  session survives with the new tokens.
- `DeleteSessionCommandHandlerTests`: the row deleted from outside between load and save → `204`, no exception.
- `SignInThrottleTests`: 20 wrong passwords at once → at most 5 checked.
- `RefreshTokenTests`: the row deleted between the read and the lock → `401`.

## Review round 1: changes to the decisions

1. **SIGN-1 is done** without the advisory lock: in Development one instance seeds. The migrations moved out of the
   seeder into `StartupDatabase`, so every environment still migrates; the seeder no longer does.
2. **SIGN-2: publish every key from its public half.** Today a key's public half comes only from opening its private
   half, so skipping an unopenable key would also unpublish it, and services verifying through that instance would
   refuse tokens the other signed. The row stores the public key (SPKI); every key is published from it. An instance
   that can't open the active key reports unhealthy and logs at Error; a key is made only when the table has none or the
   newest is due, whoever can open it. No `unopenable_at`: that is one instance's fact on a shared row. An unopenable key
   still retires by age. The first key on an empty table signs at once. Development keeps replacing a key it can't open
   (a developer who wiped their profile folder).
3. **SIGN-3 starts with the interim:** on a timeout, retry once at once, inside the 20 s grace. That makes
   `docs/ARCHITECTURE.md` true. The attempt-key protocol loosens reuse detection and changes identity-api's contract: a
   security decision, made separately.
4. **SIGN-5 stays in memory**, as `docs/ARCHITECTURE.md` "Guessing passwords" chose: an atomic reservation in the
   `ConcurrentDictionary` before hashing. A shared store is a separate decision.
5. **Decision 7, the sweeps, is out of this plan**: expired rows don't change behaviour.
6. SIGN-4 and SIGN-6 stand as written.

## Questions for a person

- With seeding in Development only, how are dealers and users created anywhere else? Today nothing else creates them.
- Who deletes a signing key that can't be opened, and how?
- Should a lost renewal answer be honoured for longer than the 20 s grace (the attempt-key protocol)?
