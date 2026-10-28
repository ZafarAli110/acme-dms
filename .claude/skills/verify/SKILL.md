---
name: verify
description: Proves a ticket's change is done, with evidence anyone can re-run, before the ticket moves. Use when implementation of a ticket is finished, or when asked to verify one. Takes the ticket key, e.g. /verify ACME-106.
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
- **standards-reviewer**: reviews the diff against `docs/standards/`.

Fix what they find and run them again. A requirement the verifier could not check is a failure, not a pass.

## 3. The evidence file

Write `docs/evidence/<KEY>.md` from the verifier's report:

```markdown
# <KEY>: <title>

Verified <date> on <branch> at <commit>.

| Requirement | Command | Expected | Got |
| ----------- | ------- | -------- | --- |

Gate: `bun run gate:fast` passed. Review: <findings fixed, or "no findings">.
```

Every row's command must be one a reviewer can paste and run against a freshly reset system (`bun run reset`) and get
the same result. No "checked in the browser".

## 4. Only then the tracker

Comment on the ticket with `add_comment`: what changed, and the evidence file's table. Then move it with
`update_ticket_status` to `in-review` (a person moves it to `done`). Both ask for permission; that is intended.
