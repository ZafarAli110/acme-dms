# Lab 09 (take-home): ACME-108, finished

**Branch:** `lab/09-export-final` · **Before:** `lab/09-export-after`

This branch adds a package: run `bun install` once after switching.

## What this branch is

`lab/09-export-after` with the export panel fixed and exports moved onto a job queue, as a production system would
run them: an `export_jobs` table, a separate `export-worker` process, fair turns between users, a limit per user
(`429`), timeouts and a heartbeat.

## Try it

1. Compare with your own fix: `git diff lab/09-export-after lab/09-export-final -- web/app/components/exports`.
2. The rest: `git diff lab/09-export-after lab/09-export-final --stat`, then `docs/standards/business-handlers.md`.
3. Start the system (`bun run dev`): the worker shows in the Aspire dashboard as its own resource.

## What to notice

- A first version that works on one laptop is not the version that serves many dealers at once. The ticket did not
  ask for a queue; scale did.

## Cost

Nothing: reading and running, no agent.
