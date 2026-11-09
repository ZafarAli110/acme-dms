# ACME-130: The DMS on a developer's machine is secure as it is live: the same sign-in, the same connection

**Created:** 2026-11-10 01:11

**Status:** In progress

**Ticket:** ACME-130 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** No screen

**Now:** Done: steps 1–7 · Next: step 8, verify-ticket · Blocked: None

## Requirement

On a developer's machine the DMS opens at a secure address, and the browser holds the sign-in under exactly the rules
it does live; where the browser can use its newer connection (HTTP/2), it is offered there as live.

- **In:** the web server (Vite in `bun run dev`, `serve-web.ts` in `start:prod`) on HTTPS and HTTP/2 with the ASP.NET
  Core development certificate, which Aspire passes it; the session and refresh cookies `Secure`, the session cookie
  `__Host-`, in every environment; a start that says what to do when the certificate is not trusted; the setup step
  (README, `setup.ps1`); the Node and Bun sides of the tests and the load test trusting the certificate; the load test
  still on plain HTTP to the gateway, plus one run through the web server's HTTPS written beside it.
- **Out:** main and the labs (D2); the gateway's own endpoint (plain HTTP behind the web server, as behind a load
  balancer: D1); production's certificates.

## Acceptance criteria: the goal

Happy

- [ ] After `dotnet dev-certs https --trust`, `bun run dev` and `bun run start:prod` open the DMS at an `https://`
      address with no browser warning
- [ ] Signed in, the browser holds `__Host-acme_session`: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no
      `Domain`; the same in dev and start:prod (no `acme_session` any more)
- [ ] Sign-in, sign-out in one tab and in two, a sign-in ended at the server (as one that ran out is), and a switch of
      location work as today
- [ ] The connection the browser actually uses, read in the browser (`nextHopProtocol` of the page and of an `/api`
      request), is `h2` in start:prod and in dev; recorded in the Log and the evidence, and noted on ACME-130
- [ ] `bun run load-test --rate 800 --seconds 30` to the gateway compares with 9 Nov 23:00 (p95 42 ms, Postgres 141%)
      within the laptop's noise; one run `--through-web` (TLS and the web server's hop) written beside it, not mixed in
- [ ] Every page as sam and as maria, in English and in French, opens with no error and no console error, over HTTPS;
      the whole e2e suite passes over HTTPS

Failure

- [ ] Without a trusted development certificate, `bun run dev`, `start` and `start:prod` stop before starting and say
      the one command to run, never a broken page (on this Mac by hand; the message and the export also run on the
      Windows runner)
- [ ] A script that calls the gateway directly (`bun run api`, the seed, the load test) still works: it never went
      through the browser's address

## Load before building

| Item                                                    | Kind     | Why                                       | Loaded? |
| ------------------------------------------------------- | -------- | ----------------------------------------- | ------- |
| `docs/ARCHITECTURE.md` "Signing in: the gateway keeps…" | Standard | the cookie's rules, HSTS, the BFF         | [x]     |
| `docs/ARCHITECTURE.md` "Handling load"                  | Standard | start:prod, the load test's comparability | [x]     |
| `docs/contracts.md` "`/api/session`"                    | Standard | the cookie's name in the contract         | [x]     |
| `docs/benchmarks/README.md`                             | Standard | where the HTTPS figure is written         | [x]     |
| `check-in-browser`                                      | Skill    | the secure address, the cookie, h2        | [x]     |

## Shape

**Follows:** Aspire's `WithHttpsDeveloperCertificate` and `WithHttpsCertificateConfiguration` (13.6.4: the callback
gives `CertificatePath` and `KeyPath`); `Bun.serve`'s `tls` and `http2` (bun-types 1.4.4: experimental, off by
default); Vite's `server.https` (8.3.5 serves `http2.createSecureServer({ allowHTTP1: true })` with or without a
proxy: its code, `chunks/node.js:14559`, and probed); the gateway's `ForwardedHeaders` (trusts `X-Forwarded-Proto`) ·
**Deviates:** None

Files (each checked to exist, or marked **new**):

1. `apphost/Acme.AppHost/AppHost.cs`: `web` gets `WithHttpsEndpoint(env: "PORT")`, the developer certificate, and
   `TLS_CERT_PATH`/`TLS_KEY_PATH` from the callback (dev and start:prod)
2. `web/vite.config.ts`: `server.https` from those paths when set; the `/api` proxy with `xfwd: true`
3. `scripts/serve-web.ts`: `Bun.serve({ tls, http2: true })`, the same `createWebHandler`; `/api` sends
   `x-forwarded-proto: https`; `scripts/serve-web.test.ts`: the forwarded header
4. `backend/gateway-api/src/Acme.Gateway.Service/Authorization/SessionCookie.cs`: `__Host-acme_session`, `Secure`,
   always; `tests/…/SessionCommandControllerTests.cs`, `tests/…/Support/GatewayUnderTest.cs`
5. `backend/identity-api/src/Acme.Identity.Service/Authorization/RefreshCookie.cs`: `Secure` always;
   `tests/…/TokenCommandControllerTests.cs` (the Development test turned round)
6. `scripts/check-certificate.ts` (**new**): `dotnet dev-certs https --check --trust`; untrusted → the command for this
   system, exit 1; trusted → exports the certificate's PEM to `.certs/localhost.pem` (`dotnet dev-certs https
--export-path … --format Pem --no-password`, the same on Windows) for Node and Bun; `scripts/check-certificate.test.ts`
   (**new**): the message for Mac and Windows, the export path; `package.json`: `dev`, `start`, `start:prod` run it;
   `.gitignore`: `.certs/`; the key is kept beside it for the web server (D8)
7. Node and Bun trust: `web/package.json` `e2e` and the root `load-test` script set `NODE_EXTRA_CA_CERTS` to that file
   (Bun's script shell sets it the same way on Windows). Probed: Node 26 and Bun refuse the certificate otherwise, even
   with `--use-system-ca`; with it, both accept it
8. `scripts/load-test.ts`: the cookie found with or without `__Host-`; `--through-web` sends to the web resource's
   `https` address instead of the gateway's (its client is HTTP/1.1, as Bun's `fetch` is without its experimental flag:
   recorded with the figure)
9. `web/e2e/sign-out.spec.ts`: the cookie's name; a new test: the sign-in ended at the server (signed out with a copy
   of the cookie) takes the open page to sign-in on its next request; `web/e2e/every-page.spec.ts` (**new**): every page
   as sam and maria, English and French, no error alert, no console error, the page's and an `/api` request's
   `nextHopProtocol` logged
10. `setup.ps1`: the trust step, skipped under `CI` (it asks the person to confirm); `README.md` (setup, Mac and
    Windows), `docs/ARCHITECTURE.md`, `docs/contracts.md`, `docs/benchmarks/README.md` (the HTTPS figure)

```ts
// scripts/serve-web.ts: HTTP/2 to a browser that offers it (ALPN), HTTP/1.1 to anything else, one port
Bun.serve({
  port: Number(process.env["PORT"] ?? 4173),
  tls: { cert: Bun.file(process.env["TLS_CERT_PATH"]!), key: Bun.file(process.env["TLS_KEY_PATH"]!) },
  http2: true, // experimental in Bun 1.4.4; if the e2e suite fails on it, node:http2 answers h2 too (probed)
  fetch: createWebHandler(join(web, "build", "client"), gatewayUrl),
});
```

```csharp
// SessionCookie.cs: one name and the same rules everywhere (ACME-130)
public static string NameFor(IHostEnvironment _) => "__Host-acme_session";   // callers keep their signature
Secure = true,
```

**Impact:** Breaking changes: a session cookie from before (`acme_session`) is no longer read: one more sign-in, local
only · Depends on: the ASP.NET Core development certificate, trusted · Performance: the browser's hop pays TLS (local
only); the gateway and the services are unchanged; the load test keeps measuring the gateway over plain HTTP.

## Tests

| Kind                    | File                                | Proves                                                          |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------- |
| Unit (.NET)             | `SessionCommandControllerTests.cs`  | `__Host-acme_session`, `Secure`, in Development too             |
| Unit (.NET)             | `TokenCommandControllerTests.cs`    | the refresh cookie `Secure` in Development too                  |
| Unit (Bun)              | `scripts/serve-web.test.ts`         | `x-forwarded-proto: https` on `/api`                            |
| Unit (Bun)              | `scripts/check-certificate.test.ts` | untrusted → the command (Mac, Windows), exit 1; the export path |
| End to end (Playwright) | `web/e2e/sign-out.spec.ts`          | sign-out over HTTPS; a sign-in ended at the server → sign-in    |
| End to end (Playwright) | `web/e2e/every-page.spec.ts`        | every page, sam and maria, en and fr; the protocol logged       |

## Steps

- [x] 1. The cookies: gateway and identity-api, their tests → verify: both projects' tests
- [x] 2. The certificate: `check-certificate.ts` and its test, `package.json`, `.gitignore`, `setup.ps1`, README →
      verify: its tests; it passes on this Mac and writes `.certs/localhost.pem`; the Windows runner runs its tests
      (`windows-setup.yml` runs `bun test scripts` on a push to final)
- [x] 3. The web server on HTTPS and HTTP/2: AppHost, Vite, `serve-web.ts` and its test → verify: unit tests
- [x] 4. Node and Bun trust, the scripts and the e2e: `NODE_EXTRA_CA_CERTS`, load-test's cookie and `--through-web`,
      the sign-out spec, `every-page.spec.ts` → verify: typecheck and lint (run in step 5)
- [x] 5. start:prod over HTTPS: restart it → verify: the whole e2e suite; `every-page.spec.ts` logs `h2`; the cookie
      read in the browser; check-in-browser at 1440 and 1024 (no warning); load test 800/s twice and once
      `--through-web`, compared with 9 Nov
- [x] 6. Dev mode: `bun run dev` → verify: it opens at `https://` with no warning; `every-page.spec.ts` logs `h2`; then
      back to `start:prod --load-test`
- [x] 7. Docs → verify: `docs:check`
- [ ] 8. `verify-ticket` → `docs/evidence/ACME-130.md`; then, by a person: Zafar Ali notes the protocols on ACME-130 (the
      tracker is not connected to this session), and someone on Windows follows the README's setup once

## Questions

None: Q1 is answered (D4).

## Decisions

- D1 TLS ends at the web server, not the gateway: the gateway stays plain HTTP behind it, told the browser's connection
  was secure (`X-Forwarded-Proto`), as behind a load balancer live (Zafar Ali, 10 Nov). The browser gets HTTP/2 in both
  modes: Vite 8.3.5 offers it with a proxy too (probed), and `serve-web.ts` with `http2: true`.
- D2 `final` only: main and the labs keep plain HTTP and the workshop's setup (Zafar Ali, 10 Nov).
- D3 The build runs to the end, then reports (Zafar Ali, 10 Nov).
- D4 No HSTS on a developer's machine: HSTS is kept per host name, so it would hold every app on `localhost` in that
  browser to HTTPS; one named difference from live, written in ARCHITECTURE and the evidence (Zafar Ali, 10 Nov, Q1).
- D8 The web server gets the certificate and key from `.certs/` (written by `check-certificate.ts` before every start,
  the key readable by its owner only, the folder ignored by git), passed by the AppHost with `WithEnvironment`, not by
  `WithHttpsDeveloperCertificate`/`WithHttpsCertificateConfiguration`: both are experimental in Aspire 13.6.4
  (`ASPIRECERTIFICATES001`, a build error unless suppressed) and nothing here uses an experimental Aspire API. One
  copy of the certificate serves the browser and Node's and Bun's trust (Claude, while building).
- D9 In `start:prod` the web server has a fixed port (5100) and no Aspire proxy in front, as the .NET services and
  dealership-api already have there: through the proxy, three load-test runs in seven waited seconds at the tail; on
  its own port, none in five (Claude, from the verifier's finding; same reason the AppHost already gives for the
  gateway). Dev mode keeps the proxy, as everything there does.
- D5 The cookie keeps one name everywhere, so a sign-in from before the change is not read: one more sign-in, local
  only (Claude, default).
- D6 `serve-web.ts` keeps `Bun.serve` with its experimental `http2: true`, over `node:http2` (which also answers `h2`):
  no adapter to write; the e2e suite over it is the check, `node:http2` the fallback (Claude, after Zafar Ali corrected
  the first probe).
- D7 Node and Bun trust the certificate through `NODE_EXTRA_CA_CERTS` and an exported PEM, not by turning certificate
  checks off (`ignoreHTTPSErrors`): the tests and the load test check the certificate as a browser does (Claude).

## Log

- 2026-11-10 01:11 Research: Vite 8.3.5's type comment says TLS only with a proxy (wrong: see the architect line); Bun 1.4.4
  `Bun.serve` with TLS answers HTTP/1.1 by default (wrong conclusion: see the correction); its `node:http2` answers `h2`;
  Aspire 13.6.4 has `WithHttpsDeveloperCertificate` and the callback's `CertificatePath`/`KeyPath`; the ASP.NET Core
  dev certificate is trusted on this Mac. `SessionCookie.cs` and `RefreshCookie.cs` drop `Secure` (and `__Host-`) in
  Development; the gateway reads the refresh cookie from `Set-Cookie` itself, so its `Secure` changes nothing there.
  Interview: D1–D3. Tracker: not moved (its MCP server is not connected to this session).
- 2026-11-10 01:20 Correction (Zafar Ali: "check bun's doc"): bun-types 1.4.4 documents `Bun.serve({ http2: true })`,
  off by default and experimental. With `tls` and `http2: true` (port 47813): curl `--http2` → HTTP/2 (GET and POST),
  `--http1.1` → HTTP/1.1. `serve-web.ts` stays on `Bun.serve` (D6).
- 2026-11-10 01:20 Architect: CHANGES, 9 findings, all fixed. (1) Vite with a proxy does serve HTTP/2: its code calls
  `http2.createSecureServer({ allowHTTP1: true })` whenever `https` is set; probed with an `/api` proxy (port 47822):
  the page, a GET and a POST through `/api` all HTTP/2, the backend saw `x-forwarded-proto: https`. (2) The protocol is
  read in the browser and noted on the ticket by Zafar Ali. (3) `--through-web` in the load test. (4) Node 26 and Bun
  refuse the certificate (`DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), even with
  `--use-system-ca`; with `NODE_EXTRA_CA_CERTS` both accept it (D7); the PEM export works. (5) A sign-in ended at the
  server, tested. (6) Every page in English and French, a new spec. (7) The Windows runner runs the certificate check's
  tests; a person on Windows follows the setup once. (8) The check's test listed. (9) HSTS on localhost moved to Q1.
- 2026-11-10 01:24 Q1 answered (Zafar Ali: leave HSTS off locally, D4) and go-ahead. Loaded the five rows: ARCHITECTURE "Signing
  in" and "Handling load", contracts "`/api/session`", benchmarks README, check-in-browser. In progress.
- 2026-11-10 01:27 Step 1: `SessionCookie.Name` is the constant `__Host-acme_session` and `Secure` always; `RefreshCookie` `Secure`
  always; neither takes the environment any more, so the four `_environment` fields that only fed them are gone. The
  gateway tests' browser-like client is on `https://localhost` (a cookie client keeps a `Secure` cookie only there).
  The Development tests turned round. gateway-api 46/46, identity-api 66/66, a full Release build of each with no
  warning (one, my own field's name, fixed), format clean.
- 2026-11-10 01:28 Step 2: `check-certificate.ts` (`--check --trust` exit 0 = trusted; then the PEM export, its key deleted at
  once) and 5 tests (trusted → the file and no key; untrusted or no `dotnet` → the command, nothing written; an export
  that fails; the Windows, Mac and Linux wording). On this Mac: exit 0, `.certs/localhost.pem` is `C890F392…`, the
  trusted certificate. `dev`, `start`, `start:prod` run it; `.certs/` ignored; `setup.ps1` and `setup.sh` trust it,
  skipped under `CI`; README (both setups, the https address, a troubleshooting row). scripts' tests pass, lint,
  typecheck, `docs:check` clean. The Windows runner runs these tests on the push.
- 2026-11-10 01:30 Step 3: AppHost `web` on `WithHttpsEndpoint(env: "PORT")` with `TLS_CERT_PATH`/`TLS_KEY_PATH` from `.certs/`
  (D8: Aspire's certificate APIs failed the build as experimental, `ASPIRECERTIFICATES001`); Vite `server.https` from
  them and `xfwd` on `/api`; `serve-web.ts` `tls` with `http2: true`, and `x-forwarded-proto` on `/api`. `check-certificate`
  keeps the key, mode 600. scripts' tests 24/24 (a new one: the forwarded header, https and http), scripts' typecheck
  and lint, web typecheck, the AppHost's Release build: clean. Not yet run: step 5.
- 2026-11-10 01:32 Step 4: `NODE_EXTRA_CA_CERTS` in the root `load-test` and web `e2e` scripts (so `gate:slow`, which runs the
  latter, trusts it too); load-test finds `__Host-acme_session` and takes `--through-web` (the web resource's `https`
  address); sign-out spec on the new name, `secure: true` asserted, and a new test: a sign-in ended at the server (a
  copy of the cookie signs out) takes the open page to sign-in on its next request; `every-page.spec.ts`: five pages
  and a part's and a customer's own page, sam and maria, en and fr, no error title, no console error, page and API
  `nextHopProtocol` `h2` asserted and annotated. Typecheck and lint clean.
- 2026-11-10 01:43 Step 5 on `start:prod --load-test`, restarted. The web build failed first: React Router's prerender runs
  `vite preview`, which took the certificate from `server.https`, then requested `https:` over plain HTTP; fixed (the
  dev server only, `!isPreview`), `web` restarted alone (`aspire resource web start`) at `https://localhost:53251`.
  curl: page HTTP/2, certificate verified (0), `/api` HTTP/2. e2e: 51 passed, 2 failed (every-page for sam: the
  browser's "Failed to load resource" for sam's two 403s on /locations, `/api/identity/v1/locations` and `/users`,
  correct refusals as today); the spec now counts the app's errors and any 5xx, not refusals; every-page 4/4. Chrome
  reports `nextHopProtocol` `h2` for the page and the API on all 7 pages, sam and maria, en and fr. Chrome holds
  `__Host-acme_session`: secure, httpOnly, Strict, path `/`, no expiry. Screenshots sign-in 1440, customers 1024: as
  before. Load test on mains, 800/s 30 s, all 24,000 answered each time: to the gateway, twice (Postgres 135–167%),
  then saved: p50 11, p95 37, p99 155 ms, Postgres 165%, gateway 83%, API 29% each; `--through-web`: p50 13, p95 37,
  p99 62 ms, Postgres 173%, gateway 87%, API 33% each (Bun's web server's CPU is not in the watcher's table). 9 Nov
  23:00: p95 42 ms, Postgres 141%: p95 within it; Postgres higher, within today's own swing, and nothing in ACME-130
  changes what Postgres is asked.
- 2026-11-10 01:47 Step 6: `bun run dev` (start:prod stopped first): web at `https://localhost:57438`; curl page HTTP/2 (verify 0),
  `/api/session` with the page's header HTTP/2 200; `every-page` and `sign-out` specs 10/10 (every page `h2` in Chrome,
  no console error, so Vite's live reload over `wss:` connected). Then `start:prod --load-test` back up:
  `https://localhost:58798`, HTTP/2. Step 7: ARCHITECTURE (the cookie the same everywhere, HSTS the one difference,
  a paragraph on HTTPS locally; start:prod), contracts (`/api/session`), benchmarks (the through-the-web figure beside
  the gateway's); `docs:check` 53/53.
- 2026-11-10 02:00 Verifier: FAIL on one row, the HTTPS load figure: its rerun `--through-web` got p95 240, p99 845 ms (Postgres
  peak 421%, client at 512 in flight) against the doc's one-run 37 ms. Rerun on mains: `--through-web` p95 29 and 31
  ms, p99 43 and 46; to the gateway p95 67 ms. The tail moves with the laptop on both ways in. The benchmarks section
  now gives every run as ranges and says the cost of HTTPS is not measurable on one laptop; it names what the table
  leaves out (the web server's CPU; Aspire's proxy in front of the web server in start:prod). Its other gaps: dev mode
  seen only by the author (sent back to it), Windows not run, the untrusted path only with a fake `dotnet`, "ran out"
  shown by a server-side end, the every-page spec blind to 4xx.
- 2026-11-10 02:01 Zafar Ali: fix the dotnet-missing message (the verifier's note). `checkCertificate` tells a missing `dotnet`
  (the runner's null) from an untrusted certificate: `NO_DOTNET_MESSAGE` names the .NET SDK and how to get it, never a
  `dotnet` command. Test turned round (the message, nothing written); run for real with only `bun` on the PATH: the
  new message, exit 1. scripts' typecheck and lint clean.
- 2026-11-10 02:11 Verifier, second round: dev mode PASS (its own run: page and `/api` HTTP/2, `ssl_verify=0`, the `__Host-` cookie,
  no HSTS, every-page and sign-out 10/10; outputs in its scratch folder); the load figure FAIL again (its second
  `--through-web`: p95 316, p99 670 ms, Postgres peak 294%, 523 in flight: the laptop does not explain it). It also
  found the first dev start waiting about 4½ minutes on macOS's keychain dialog inside the certificate export. Fixed:
  `check-certificate` exports only when `.certs/` does not already hold the trusted certificate (thumbprint from
  `--check`'s output against the file's), and says so before it does (on macOS: "choose Always Allow"); 7 tests (two
  new: no export when it is there; again when renewed or the key is gone); for real here: 0.5 s, silent, `.certs/`
  untouched. README: the one dialog at the first start.
- 2026-11-10 02:22 The load figure, measured. On the same build, alternating, `--through-web` with `services__web__https__0` set to
  the proxied address (`:53978`) and to serve-web's own (`:30710`): proxy p95 758 then 48 ms; own port 37 then 53. All
  three seconds-long tails of the day (240, 316, 758) went through Aspire's proxy. D9: start:prod gives web port 5100,
  not proxied; AppHost builds; start:prod restarted, web at `https://localhost:5100` (HTTP/2, verify 0, Bun listening
  on it). Then `--through-web` three times: p95 49, 71, 43, p99 84, 147, 91; the gateway between them p95 49, p99 101.
  Benchmarks section rewritten: every run of the day by way in (gateway 4, proxied web 7, own-port web 5); ARCHITECTURE
  names port 5100. The whole e2e suite 53/53 on it; gate 23/23.
