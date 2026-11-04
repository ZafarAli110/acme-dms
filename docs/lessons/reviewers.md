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

### performance-reviewer: "introduced" for a scan that was already there (5 Nov 2026)

- **Finding:** PERF-S1 on ACME-106, no index for the recent-customers query, marked `introduced`, and sourced to
  `database.md`.
- **Why it was wrong:** the finding's own text says the query "was already a full scan before this change", and before
  it the query had no location filter, so it read every customer of every dealer; now it reads one location's. The
  missing index is true and stays open, but it is `already there`. The rule is in `.claude/agents/performance-reviewer.md`,
  not in `database.md`.
- **Evidence:** `get-recent-customers.query-handler.ts` before commit 5b23f8c (`where` had only `isNotNull` and
  `notDeleted`); `persistence/schema/customers.ts:27` (only `ix_customers_location`).
- **Learned:** not yet; one entry is not a pattern.

## Missed

None yet.

## Learned

Entries above marked **Learned** are in the reviewer's instructions; `/learn-from-lessons` may remove them from here
once they have held for a few reviews.
