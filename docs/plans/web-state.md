# Plan: the web app's stages, declared in its kernels

Branch: every branch: the kernels, guards, forms and dialog are the same on `main`, `final` and the labs. WEB-2 (the
`412` conflict) is on `final` only. `main` first, then the labs and `final`. Part of
[implicit state machines](implicit-state-machines.md).

## Why

The auth kernel already has a status union and a generation guard, and the location kernel derives its status in one
`select()`. But much of each tab's state lives beside them, in session storage, router state and refs, and moves that
cross them (another tab, Back, a slow answer) land in combinations nothing handles.

- **WEB-1, a location switch caches the wrong location (checked).** `switchLocation` (`locationKernel.ts:54-62`)
  commits, and `select()` writes the new id to session storage (`:82`); then `invalidateQueries()` runs at once, before
  React re-renders. The queries still mounted carry location A's keys, refetch, and `sendOnceAsync` reads the header at
  send time (`apiClient.ts:158`): B's rows are cached under A's keys. Switching back shows them until a refetch, and a
  loader with `staleTime: "static"` returns them without fetching. _Traced through TanStack Query's code, not run: the
  first test below decides it._
- **WEB-2, a `412` never clears (traced, `final`).** On error the edit actions return before they invalidate
  (`CustomerEdit.tsx:49-52`, `PartEdit.tsx:45-48`); the loader reads with `staleTime: "static"`, which TanStack Query
  answers from cache even when invalidated; so the form keeps the old version and every save is `412` until a reload.
  No message tells the user how to recover.
- **WEB-3 (traced).** `followOtherTab` commits `resolving` and swallows a failure (`authKernel.ts:114-117`): if
  identity-api fails, the tab is blank, with no error, until the user navigates.
- **WEB-4 (traced).** The same user signing in in another tab calls `forget()`, which clears the location: the page key
  becomes `""`, a dirty form unmounts unguarded, and the tab comes back on the default location, not its own.
- **WEB-5 (traced).** Back within the sign-out wait drops the redirect, but the action runs on: the cookie and the
  session are gone, the snapshot still says signed in, every request is `401`, and `sessionExpiry` never fires because
  `session.isSignedIn()` is already false.
- **WEB-6 (traced).** `PartEdit.tsx:74` keys the form by `updatedAt`; while a photo is pending it polls every 2 s; if
  someone else saves the part, the form remounts and the user's edits are gone without a word.
- **WEB-7 (traced).** `PartCreateDialog` stays mounted (`PartList.tsx:80`): after a location switch the old bin is still
  chosen (the select shows empty, Create is enabled, the server refuses it); closing while the create is pending still
  navigates; the error survives closing.
- **WEB-8 (traced).** Photo polling (`usePart.ts:8`) never stops while a photo is pending.
- **Smaller:** a false "account not loaded" when another tab signs in during this tab's sign-in; Back during a save or
  during the switch dialog leaves without asking; a double click can send two PUTs (the second gets the `412`); the error
  alert stays after further edits; `registerBeforeUnloadBypass` adds a closure on every mount and nothing calls
  `disableAllBeforeUnload`; the grid keeps `page=N` across a location switch.

## The machines, declared

**Auth** (kernel): `resolving{boot | follow} → signed-in | signed-out | unreachable{retryAt}`, and
`signed-in → signing-out → signed-out`. `signed-in` from another tab: the same user keeps the location, cache and forms;
a different user reloads.

**Location** (kernel): `pending → ready{current} → switching → ready`. A request is sent for the location in its query
key, never for whatever session storage says at that moment.

**Save** (a hook used by both edit pages): `idle → dirty → submitting → saved | failed{message} | conflict`. An edit
clears `failed`; `submitting` ignores a second submit; `conflict` offers "Reload their version" or "Keep my edits".

**Create dialog**: `closed → editing → submitting → closed`, reset on close and on a location switch.

## Decisions

1. **The location travels with the query.** The query function passes `locationId` from its key to `apiClient`, which
   sends that as `x-location-id`. `switchLocation` cancels and removes the old location's queries, then invalidates.
   No page asks with an empty location (`enabled: locationId !== ""`).
2. **Auth gets `signing-out` and `unreachable`.** `signOutAsync` commits `signing-out` and, once the gateway answered,
   leaves for the sign-in page itself (`window.location.replace`), whatever the router did meanwhile. A failed follow is
   `unreachable`, with a banner and a retry on back-off. `signInAsync` waits for the latest check, not a stale one.
3. **The same user signing in elsewhere changes nothing here**: compare user ids before `forget()`.
4. **A conflict is a state, not an error.** The action invalidates the detail and returns `{ kind: "conflict" }`; the
   detail loader drops `staleTime: "static"`; `apiErrors.ts` gets the precondition type with its message.
5. **A form is keyed by its id, not `updatedAt`.** A newer record resets a clean form and shows a "changed by someone
   else" banner on a dirty one. The leave guard stays on while submitting.
6. **The create dialog is keyed by the location** and resets on close; it navigates only if still open.
7. **Polling stops after 2 minutes** (see the photo plan).
8. **`registerBeforeUnloadBypass` returns its unregister**, or goes if nothing needs it.

## Tests (each fails today)

- `core/kernel/__test__/locationKernel.test.ts` (new): an observer on location A's parts list, `switchLocation(B)` → no
  request for an A key carries `x-location-id: B`.
- `core/kernel/__test__/authKernel.test.ts` (new, a fake BroadcastChannel): another tab's sign-in during `signInAsync`
  → no error; the same user's sign-in elsewhere keeps the location; a failed follow → `unreachable`; `signOutAsync`
  commits `signing-out`.
- `web/e2e/parts.spec.ts`: two pages edit one part; the second saves; the first saves, sees the conflict, reloads their
  version, saves → saved (`final`). Pick a bin in the new-part dialog, close, switch location, reopen → no bin, Create
  disabled.
- `web/e2e/forms.spec.ts`: a dirty part form with a photo pending; another page saves the part → the edits stay and the
  banner shows.
- `web/e2e/sign-out.spec.ts`: the gateway's answer delayed 3 s, confirm, go Back → the sign-in page; the same user signs
  in in a second tab → the first tab's dirty form is still there.

## Review round 1: changes to the decisions

1. **The location travels with every location-scoped call**, not only queries: actions, the export stream and
   downloads too. `apiClient` takes the location explicitly, with no fallback to session storage; an action takes the
   location captured when its form opened. On `main` and the labs up to `lab/09-export-before` this is a narrow
   `locationId` option, never lab 9's `headers` option.
2. **The `signed-in` message carries the user id**; when it matches this tab's user, the tab checks in the background
   without committing `resolving`, and keeps its location, cache, forms and export cards.
3. **"Keep my edits" merges.** A PUT sends every field, so keeping the old form would overwrite what the other person
   changed. The conflict state holds their version; "Keep my edits" puts only the fields this user changed onto it,
   takes its version, and goes back to `dirty`. The smallest first step: invalidate on a `412` too.
4. **`signing-out` leaves on the timeout as well as the answer**, announcing to the other tabs before it navigates.
5. **A late revoke flag must not end the next sign-in:** `signing-out` writes `revokePending` only if no sign-in
   happened since it began (a counter shared through `localStorage`). This one was already there.

## Questions for a person

- On a save conflict: "Reload their version" and "Keep my edits", or other words, or one choice only?
- The banners: "changed by someone else" on a dirty form, and "can't reach the server" while the tab retries.
- When the same user signs in again in another tab, should a dirty form here stay as it is? (The plan says yes.)
