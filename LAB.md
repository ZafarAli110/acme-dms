# Lab 09 (take-home): ACME-108, after

**Branch:** `lab/09-export-after` · **Before:** `lab/09-export-before` · **Fixed:** `lab/09-export-final`

This branch adds a package: run `bun install` once after switching.

## What this branch is

ACME-108 (export the customer list) as the agent built it, with the lesson it wrote in `docs/lessons/ACME-108.md`.

## Try it

1. `git diff lab/09-export-before lab/09-export-after --stat`: what one ticket changed.
2. Read `docs/lessons/ACME-108.md`: what went wrong on the way, and the evidence for each lesson.
3. Start the system (`bun run dev`), sign in, and export the customer list. Watch the export panel closely: one thing
   in it is not right. Find it, then ask Claude to fix it with the harness (`/implement-ticket`, then `/verify-ticket`).

## What to notice

- Every check passed, and something is still wrong. What check would have caught it? Add it to a skill or a test.

## Cost

Steps 1 and 2 cost nothing. Step 3's fix is a small ticket.
