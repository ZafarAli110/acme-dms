# What the reviewers got wrong, and what they missed

Every reviewer in `.claude/agents/` reads this file before it reviews, so a mistake made once is not made again.
`/resolve-pr-comments` and `/ticket-to-pr` add to it; `/learn-from-lessons` moves what repeats into the reviewer's own
instructions and marks the entries here as learned.

- **Wrong:** a finding the code shows is not true. The reviewer, the finding, why it was wrong, and the code that shows
  it. Two entries with the same reason are a pattern: `/learn-from-lessons` turns it into a "check before you flag"
  line.
- **Missed:** a real bug a person or QA found that no reviewer flagged. The bug, and what the reviewer did not have in
  front of it. The fix goes where it would have caught it: a skill, a standard, a lint rule or a test.

## Wrong

### security-reviewer: formula injection in the customer export (4 Nov 2026)

- **Finding:** user text written to the spreadsheet can run as a formula when the file is opened.
- **Why it was wrong:** formula injection needs a CSV, or a cell written as a formula (`<f>`). `textCell` writes an
  inline text cell (`t="inlineStr"`), which Excel shows as text and never runs.
- **Evidence:** `backend/dealership-api/src/business-logic/exports/xlsx/xlsx-cells.ts`, `textCell`; the test
  `textCell("=1+1")` in its `__test__/`.
- **Learned:** the security reviewer's A03 now says to check which kind of cell the code writes.

### security-reviewer: export routes without a permission (4 Nov 2026)

- **Finding:** `GET`, `DELETE` and the events of `/v1/exports/:jobId` have no `@RequirePermission`.
- **Why it was wrong:** each goes through `ExportJobRunner.ownJob`, which answers "not found" for any job that is not
  the caller's own; a permission would add nothing.
- **Evidence:** `backend/dealership-api/src/business-logic/exports/export-job-runner.ts`, `ownJob`.
- **Learned:** the security reviewer's A01 now accepts an owner check that answers "not found".

## Missed

### test-reviewer, clean-code-reviewer, security-reviewer: signing out broke the other tabs (7 Nov 2026)

- **Bug:** signing out with several tabs open emptied the screen behind the sign-out dialog (skeletons), took several
  clicks, and left the other tabs on their page: one showed "This is not a customer of ." until a click took it to the
  sign-in page. Found by a person testing under Aspire with four tabs open.
- **Why:** the web app forgot the sign-in (its cached data and selected location) before asking the gateway, so the
  page fetched again with no location while the dialog waited; nothing stopped a second submit; and another tab only
  cleared its state, it never left its page.
- **What the reviewers did not have in front of them:** a second tab and a slow answer. Three review rounds read the
  diff (round 1 even reordered sign-out against the browser-cache clear), and the end-to-end tests used one tab, a fast
  local gateway and the Home page. Each step was right on its own; the order across tabs was the bug.
- **Evidence:** gateway traces, 7 Nov 11:43:53: the first `DELETE /api/session` answered 204 in 83 ms, four more
  followed within eight seconds, and the page's fetches got 401 meanwhile. The new end-to-end test fails on the old code
  (the other tab stays on `/customers/new`) and passes on the fix.
- **Fix:** the gateway first, then a fresh sign-in page in every tab (`web/app/core/kernel/authKernel.ts`,
  `signOutAsync` and `leaveForSignIn`); the dialog says it is signing out and cannot be sent twice (`TopBar.tsx`). What
  would have caught it: `web/e2e/sign-out.spec.ts`, "signing out in one tab takes every tab to the sign-in page".
- **Learned:** sign-in is a state machine across tabs. The new `state-reviewer` (7 Nov 2026) plays every change to a
  stage through two tabs, two requests, a slow answer and a lost one, and asks of each unfinished state what moves it on.

## Learned

Entries above marked **Learned** are in the reviewer's instructions; `/learn-from-lessons` may remove them from here
once they have held for a few reviews.
