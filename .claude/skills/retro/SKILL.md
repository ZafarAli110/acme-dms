---
name: retro
description: Writes what a finished ticket taught, as lessons with evidence, to docs/lessons/<KEY>.md. Use after a ticket's QA is clean, e.g. /retro ACME-108, or when asked what was learned.
---

# Retro: what this ticket taught

Lessons come from what actually went wrong: the bugs QA filed, the gate failures, the measurements that surprised,
the first attempt that had to be thrown away. Read them from the tracker (the bugs that say "Found while checking
<KEY>"), `docs/qa/<KEY>.md`, `docs/plans/<KEY>.md` and `git log`, not from memory.

Write `docs/lessons/<KEY>.md`, one entry per lesson:

```markdown
## L1 <the rule, as an instruction: "Stream an export row by row; never load the whole result">

- What happened: the symptom, with the bug key or the failing check.
- Why: the cause in the code (file and function).
- What fixed it: the change (file, commit).
- Evidence: the command that shows it, with its result before and after the fix (a time, a count, a memory size),
  or the test that failed before and passes now.
- Applies when: the kind of work where this will come up again ("any export or report over a large table").
```

Rules:

- **No evidence, no lesson.** Something believed but not shown goes under `## Unproven` at the end, and is never
  turned into a skill.
- One cause, one lesson. Two bugs with the same cause are one lesson that names both.
- Do not restate a rule `docs/standards/` already has: say the standard was missed, and why.
- Write what would have prevented it, not what happened to fix it this once.

Then suggest `/learn`.
