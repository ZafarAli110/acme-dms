---
name: verify-ticket
description: Proves a ticket's change is done, with evidence anyone can re-run, before the ticket moves. Use when implementation of a ticket is finished, or when asked to verify one. Takes the ticket key, e.g. /verify-ticket ACME-106.
---

# Verify a ticket

Done is decided by evidence, not by the person (or agent) who made the change. Three layers, in this order; stop at
the first that fails and go back to the code.

## 1. The shared gate (deterministic)

`bun run gate:fast`. The same targets run in CI (`.github/workflows/ci.yml`), so a pass here is a pass there.

## 2. Two independent reviews (in parallel)

Dispatch both subagents at once, each with the ticket key:

- **verifier**: checks every requirement of the ticket in the running system and returns a table of commands, expected
  and actual results.
- **clean-code-reviewer**: reviews the diff against `docs/standards/`.

Fix every `blocking` and `should-fix` finding this change `introduced`, and run them again; list the ones
`already there` in the evidence file for a person to decide. A `REJECT` stops the work: tell the person. A requirement
the verifier could not check is a failure, not a pass.

## 3. The evidence file

Write `docs/evidence/<KEY>.md` from the verifier's report:

```markdown
# <KEY>: <title>

Verified <date> on <branch> at <commit>.

| Requirement | Command | Expected | Got |
| ----------- | ------- | -------- | --- |

Gate: `bun run gate:fast` passed. Review: <findings fixed, or "no findings">.

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
