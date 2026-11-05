# Lab 09 (take-home): ACME-108, after

**Branch:** `lab/09-export-after` · **Before:** `lab/09-export-before` · **Fixed:** `lab/09-export-final`

This branch adds a package: run `bun install` once after switching.

## What this branch is

ACME-108 (export the customer list) as the agent built it, with the lesson it wrote in `docs/lessons/ACME-108.md`.

## Exercise

**Goal:** Find what is wrong in the export panel, although every check passed.

**Tickets:** ACME-108 is already built on this branch: don't pick it. The others are open.

1. `git diff lab/09-export-before lab/09-export-after --stat`: what one ticket changed.
2. Read `docs/lessons/ACME-108.md`: what went wrong on the way, and the evidence for each lesson.
3. Start the system (`bun run dev`), sign in, and export the customer list. Watch the export panel closely: one thing
   in it is not right. Find it, then ask Claude to fix it with the harness (`/implement-ticket`, then `/verify-ticket`).

   **Stuck?** Watch the panel from the very first second of an export. The answer is on the next branch.

## What to notice

- Every check passed, and something is still wrong. What check would have caught it? Add it to a skill or a test.

## Cost

Steps 1 and 2 cost nothing. Step 3's fix is a small ticket.

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
git switch lab/09-export-final
```

`lab/09-export-final` adds a package: run `bun install` once after switching.
