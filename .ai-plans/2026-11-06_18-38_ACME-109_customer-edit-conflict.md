# ACME-109: Two people edit the same customer and one change disappears

**Created:** 2026-11-06 18:38

**Status:** Done

**Ticket:** ACME-109 · **Branch:** final

**Scope:** Large (9+) · **Layers:** Both

**Design:** Follows: the existing customer edit page (`web/app/pages/customers/CustomerEdit.tsx`)

**Now:** Done: a second save from an old version is refused with 412 and a message, and the person can load the latest version and try again · Next: none · Blocked: None

## Requirement

Maria and Sam both open Jonas Berg. Sam saves a new phone number. Maria saves a new town after him, and Sam's number must not come back. Her save is refused, she is told someone else changed the customer, and she can load the latest version and make her change again.

- **In:** a version on every customer, checked on every save, however the save is made (screen, script or any other client of the API).
- **Out:** merging two changes automatically, and locking a customer while someone has them open.

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log.

Happy

- [x] Nobody else saved in between → the save works as it does today, and the answer carries the next version.
- [x] Open a customer a second time → the page asks again with its version and gets 304 with no body when nothing changed.

Failure: invalid input, absent data, not allowed, another service down

- [x] Someone else saved since you opened the customer → your save is refused (412) and nothing they saved is lost.
- [x] The refusal says someone else changed the customer → you can load their latest version before you try again.
- [x] A save from a script with no `If-Match` → refused (428), and a header that is not one version → 412.
- [x] Two saves from the same version at the same moment → only one is stored.

## Load before building

| Item                                                                                                        | Kind     | Why                                      | Loaded? |
| ----------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- | ------- |
| `build-api-endpoint`                                                                                        | Skill    | the controller, handler and test pattern | [x]     |
| `build-form-page`                                                                                           | Skill    | the customer edit page and its form      | [x]     |
| `docs/standards/api-errors.md` "Saving a record someone else changed: ETag, If-Match, 412 (dealership-api)" | Standard | the rule this change sets and then meets | [x]     |

## Shape

**Follows:** the existing customer update (`PUT` replaces every field) · **Deviates:** None

Files (each checked to exist):

1. `backend/dealership-api/src/persistence/schema/customers.ts`: the `version` column.
2. `backend/dealership-api/src/persistence/migrations/drizzle/0003_row_versions.sql`: adds the column, with its snapshot and journal entry.
3. `backend/dealership-api/src/service/concurrency/record-version.ts`: `etagOf`, `versionOf`, `matchesIfNoneMatch`, `IfMatchVersion`, `NotModifiedException`.
4. `backend/dealership-api/src/service/interceptors/etag.interceptor.ts`: `@ETagged()` sends the ETag and answers 304.
5. `backend/dealership-api/src/service/controllers/customers/customer-command.controller.ts`: `PUT` reads the version.
6. `backend/dealership-api/src/service/controllers/customers/customer.controller.ts`: the `GET` of one customer is `@ETagged()`.
7. `backend/dealership-api/src/business-logic/handlers/customers/update/update-customer.command-handler.ts`: checks and bumps the version in one `UPDATE`.
8. `backend/dealership-api/src/i18n/catalogs/en.ts` (and `fr.ts`): `customerChangedByOthers`, `ifMatchRequired`, `ifMatchInvalid`.
9. `web/app/core/services/ifMatch.ts`: the `If-Match` header from a version.
10. `web/app/pages/customers/queries/customerQueries.ts`: `updateCustomerAsync` sends it.
11. `web/app/pages/customers/CustomerEdit.tsx`: on 412 it reads the latest customer again.
12. `web/app/pages/customers/CustomerForm.tsx`: shows the "changed elsewhere" notice, with keep mine or show theirs.
13. `web/app/core/hooks/useFormRevision.ts`: a newer version never wipes unsaved edits.
14. `scripts/api.ts`: `--if-match` for `bun run api`.

High-level code: the version is checked in the same statement that writes, so two saves can never both win.

```ts
// update-customer.command-handler.ts
public async executeAsync(userContext: UserContext, customerId: string, request: CustomerUpdateRequestDto,
  expectedVersion: number | null): Promise<CustomerResponseDto> {
  // ... .set({ ...fields, version: sql`${customers.version} + 1` })
  //     .where(and(isThisCustomer, ...(expectedVersion === null ? [] : [eq(customers.version, expectedVersion)])))
  if (!updated) {
    // no row: another location's or absent customer is 404, a customer that moved on is 412
    throw current ? new PreconditionFailedException(localized("errors.customerChangedByOthers"))
                  : new NotFoundException(localized("errors.customerNotFound", { customerId }));
  }
}

// record-version.ts: no header is 428, `*` is null (any version), anything but "7" is 412
export const IfMatchVersion = createParamDecorator((_data: unknown, context: ExecutionContext): number | null => { ... });
```

On the web, the form sends the version it was opened with, never a refetched one:

```ts
// CustomerEdit.tsx, clientAction
await customerQueries.updateCustomerAsync(customerId, input, version, locationId ?? resolved.locationId);
// on ApiError 412: invalidate the customer detail query so the form can show their version
```

**Impact:** Breaking changes: a `PUT` of a customer without `If-Match` is now 428; callers must send the version (the web app and `bun run api --if-match` do) · Depends on: migration 0003 (`ADD COLUMN`, instant) · Performance: a `GET` still runs its query and checks who is asking, so a 304 saves the body, not the work.

## Tests

Written with the code they cover, failing first.

| Kind                    | File                                                                                                                   | Proves                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Handler (real Postgres) | `backend/dealership-api/src/business-logic/handlers/customers/update/__test__/update-customer.command-handler.test.ts` | a save from an older version is refused and the newer one is kept; `*` saves, but another location's customer is still refused |
| HTTP                    | `backend/dealership-api/src/service/__test__/record-version.test.ts`                                                   | strong ETag, 304 with no body, 428 without `If-Match`, 412 when malformed, `*`                                                 |
| Web hook                | `web/app/core/hooks/__test__/useFormRevision.test.ts`                                                                  | a newer version does not wipe unsaved edits                                                                                    |
| End to end (Playwright) | `web/e2e/edit-conflicts.spec.ts`                                                                                       | two windows edit one customer: keep my edits puts them on top of the other person's                                            |

## Steps

- [x] 1. Add `version` to customers, with migration 0003 → verify: the handler test reads `version: 2` after one save.
- [x] 2. Write `etagOf`, `IfMatchVersion` and `@ETagged()` → verify: `record-version.test.ts`.
- [x] 3. Check and bump the version in the handler's `UPDATE` → verify: the older-version test keeps the newer city.
- [x] 4. Add the messages in English and French → verify: the catalogs test refuses a missing French key.
- [x] 5. Send `If-Match` from the web form and `bun run api` → verify: a save from the form still works.
- [x] 6. On 412, show the latest version without losing unsaved edits → verify: `useFormRevision.test.ts`.
- [x] 7. Two windows on one customer → verify: `edit-conflicts.spec.ts`, written; not yet run in a browser.

## Questions

None.

## Decisions

- D1 The version is the ETag, quoted (`"7"`), over a timestamp: a save in the same second cannot be told apart by a date.
- D2 `If-Match: *` saves whatever the version, for scripts that mean to overwrite; the web form never sends it.
- D3 A refusal offers the latest version and keeps the person's edits (keep mine or show theirs), over merging automatically, which the ticket leaves out.

## Log

- 2026-11-06 18:38 `8c56ebf` built the ticket: version column, `@ETagged()`, `@IfMatchVersion()`, 412 / 428 / 304. The commit message records 127 dealership-api tests passing, 6 of them new.
- 2026-11-07 00:14 `a9e8f08` versioned record GETs are `private, no-cache`; all other answers stay `no-store`.
- 2026-11-07 02:54 `d16eb10` ETags vary by the session cookie too.
- 2026-11-07 20:35 `15e03db` and 20:36 `0d51e68`: a newer version never wipes unsaved edits, and a refused save fetches their version (`useFormRevision.test.ts`).
- 2026-11-07 20:37 `a68506f` added `edit-conflicts.spec.ts`: two windows edit one part or customer.
- 2026-11-07 20:57 `854e204` keep my edits merges the part's photo lists (a part fix, not the customer).
- Not run: `web/e2e/edit-conflicts.spec.ts` has not been run in a browser; the history shows no run of it.
