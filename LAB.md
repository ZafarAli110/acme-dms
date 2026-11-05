# Lab 09 (take-home): ACME-108, before

**Branch:** `lab/09-export-before` · **Before:** `lab/08-plans` · **After:** `lab/09-export-after`

## What this branch adds

The steps after a ticket is built, each started by you:

| Command               | Does                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `/qa-ticket <KEY>`    | the `qa` subagent tests the ticket in the running system and files a bug for each failure (`docs/qa/`) |
| `/write-retro <KEY>`  | writes what the ticket taught, as lessons with evidence (`docs/lessons/`)                              |
| `/learn-from-lessons` | turns proven lessons into a skill, so the next ticket of the kind starts right                         |

## Exercise (at home)

**Goal:** Build ACME-108, test it the hard way, QA it, and turn what went wrong into lessons.

**Tickets:** ACME-108 is the one to build here; the others are open.

1. With the tracker running, `/implement-ticket ACME-108`: read the ticket's plan and answer its questions.
2. Build it, then `/verify-ticket ACME-108`.
3. **Test it the hard way**, as a tester would:
   - `bun run seed:bulk`: Northside then has 1.6 million customers.
   - As `maria` at Northside, export with no filter, and watch dealership-api's memory while it runs (Activity
     Monitor on macOS, Task Manager on Windows).
   - `bun run xlsx:inspect <the file>`: does its row count match the list's total? How many sheets?
   - Start another export and cancel it half way: is the server still up?
4. `/qa-ticket ACME-108`, then `/write-retro ACME-108` once QA is clean, then `/learn-from-lessons`.
5. Compare with the branch where it was done: `git diff lab/09-export-before lab/09-export-after --stat`.

## What to notice

- QA reads only the ticket, never the code: it tests what was asked, not what was built.
- A lesson without evidence stays unproven and never becomes a skill.

## Cost

This is a whole ticket plus QA: the largest run in the labs. Do it when you have the budget, not in the room.

## Next

Changed files you want to keep? Put them on a branch of their own first, or they come with you (the same in
PowerShell):

```bash
git switch -c run/<what-you-tried>
git add -A
git commit -m "<what you tried>"
```

Then:

```bash
git switch lab/09-export-after
```

`lab/09-export-after` adds a package: run `bun install` once after switching.
