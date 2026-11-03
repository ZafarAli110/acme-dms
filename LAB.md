# Lab 07: Verification, evidence not claims

**Branch:** `lab/07-verification` · **Before:** `lab/06-skills` · **Next:** `lab/08-plans`

This branch adds a package: run `bun install` once after switching.

## What this branch adds

- The `verify-ticket` skill (`/verify-ticket <KEY>`): runs the checks and the `verifier` subagent, and
  writes `docs/evidence/<KEY>.md`: each requirement, the command that checks it, what it should return
  and what it returned.
- The `check-in-browser` skill: drives the running app with `playwright-cli`, to check a change the way a user sees it.
- `CLAUDE.md` ("Done means") now runs `/verify-ticket` before a ticket is called done.

## Try it

1. Open `.claude/skills/verify-ticket/SKILL.md` and `docs/evidence/README.md`.
2. If you built a ticket in lab 01 (`run/harness-101`), bring it here and run `/verify-ticket ACME-101`, then open
   `docs/evidence/ACME-101.md` and re-run one of its commands yourself.

## What to notice

- The agent is never the source of its own evidence: a command anyone can re-run is.
- A stale result, or one from the wrong server, is refused.

## Cost

Step 2 runs the checks and two subagents: moderate to large. Reading the skill costs nothing.
