# Lab 09 (take-home): ACME-108, finished

**Branch:** `lab/09-export-final` · **Before:** `lab/09-export-after`

This branch adds a package: run `bun install` once after switching.

## What this branch is

`lab/09-export-after` with the export panel fixed and exports moved onto a job queue, as a production system would
run them: an `export_jobs` table, a separate `export-worker` process, fair turns between users, a limit per user
(`429`), timeouts and a heartbeat.

## Exercise

**Goal:** Compare your fix with the finished version, and see what serving many dealers needed.

**Tickets:** ACME-108 is already built on this branch: don't pick it. The others are open.

1. Compare with your own fix: `git diff lab/09-export-after lab/09-export-final -- web/app/components/exports`.
2. The rest: `git diff lab/09-export-after lab/09-export-final --stat`, then `docs/standards/business-handlers.md`.
3. Start the system (`bun run dev`): the worker shows in the Aspire dashboard as its own resource.

## What to notice

- A first version that works on one laptop is not the version that serves many dealers at once. The ticket did not
  ask for a queue; scale did.

## Cost

Nothing: reading and running, no agent.

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
git switch lab/10-ticket-to-pr
```

`lab/10-ticket-to-pr` adds a package: run `bun install` once after switching.
