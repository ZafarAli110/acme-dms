---
name: verify-ticket
description: Proves a ticket's change is done, with evidence anyone can re-run, before the ticket moves. Use when implementation of a ticket is finished, or when asked to verify one. Takes the ticket key, e.g. /verify-ticket ACME-106.
---

# Verify a ticket

**The ticket key, in any case.** `acme-106`, `Acme-106` and `ACME-106` are the same ticket: write it in capitals
everywhere it appears (the branch, the plan's name, commits, comments, the tracker).

Done is decided by evidence, not by the person (or agent) who made the change. Two layers, in this order; stop at the
first that fails and go back to the code. This is evidence, not review: the reviewers read the diff once, when the
pull request is opened, not here.

## 1. The shared gate (deterministic)

`bun run gate:fast`. The same targets run in CI (`.github/workflows/ci.yml`), so a pass here is a pass there.

## 2. The verifier, in its own context

Dispatch the **verifier** subagent with the ticket key. It checks every requirement of the ticket in the running system
and returns a table of commands, expected and actual results. A requirement it could not check is a failure, not a
pass: fix the code, then dispatch it again for that requirement only.

## 3. The evidence file

Write `docs/evidence/<KEY>.md` from the verifier's report:

```markdown
# <KEY>: <title>

Verified <date> on <branch> at <commit>.

| Requirement    | Command                           | Expected                                           | Got             |
| -------------- | --------------------------------- | -------------------------------------------------- | --------------- |
| Screen: <name> | screenshots at 1440 and 1024 wide | nothing overlaps or is cut off; matches the design | <what was seen> |

Gate: `bun run gate:fast` passed.

## What these checks don't prove

- <a case, size or path no row above exercises, and why it matters>
```

A green check proves only what it checks. Before writing that section, ask of each row what would still pass if the
code were wrong: the data was small (3 rows, not 1.6 million), only one user or one location was tried, a failure path
never ran, the test shares the code's own assumption. Name at least one, and say whether it needs a person, a test, or
nothing. "None" is never the answer: if you can't name a gap, the checks were not read.

Every row's command must be one a reviewer can paste and run against a freshly reset system (`bun run reset`) and get
the same result. No "checked in the browser".

## 4. Only then the tracker

Comment on the ticket with `add_comment`: what changed, the evidence file's table, and what the checks don't
prove. Then move it with
`update_ticket_status` to `in-review` (a person moves it to `done`). Both ask for permission; that is intended.
