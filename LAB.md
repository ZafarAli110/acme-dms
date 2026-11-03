# Lab 09 (take-home): ACME-108, before

**Branch:** `lab/09-export-before` · **Before:** `lab/08-plans` · **After:** `lab/09-export-after`

## What this branch adds

The steps after a ticket is built, each started by you:

| Command        | Does                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `/qa <KEY>`    | the `qa` subagent tests the ticket in the running system and files a bug for each failure (`docs/qa/`) |
| `/retro <KEY>` | writes what the ticket taught, as lessons with evidence (`docs/lessons/`)                              |
| `/learn`       | turns proven lessons into a skill, so the next ticket of the kind starts right                         |

## Try it (at home)

1. With the tracker running, `/ticket ACME-108`: read the ticket's plan and answer its questions.
2. Build it, then `/verify ACME-108`.
3. `/qa ACME-108`, then `/retro ACME-108` once QA is clean, then `/learn`.
4. Compare with the branch where it was done: `git diff lab/09-export-before lab/09-export-after --stat`.

## What to notice

- QA reads only the ticket, never the code: it tests what was asked, not what was built.
- A lesson without evidence stays unproven and never becomes a skill.

## Cost

This is a whole ticket plus QA: the largest run in the labs. Do it when you have the budget, not in the room.
