---
name: resume-handoff
description: Picks up where the last session stopped - reads the handoff note, checks it against the repository, summarises and recommends the next step, then waits. Started by a person, e.g. /resume-handoff, at the start of a session.
disable-model-invocation: true
---

# Resume from the handoff

## Read only what the next step needs

- `CLAUDE.md` is already loaded: do not read it again.
- Read `.claude/handoff.md`. If there is none, say so and use the open plans (`.ai-plans/`) and
  `git log --oneline -10` instead.
- If the note names a plan, read that plan; it is the ticket's record and wins over the note.
- Then only the files the first "Next" step touches.

## Steps

1. **Check the note against the repository:** `git status`, the branch, `git log --oneline -5`, and that the files and
   plans it names exist. Where the note and the repository disagree, trust the repository, and say what differs.
2. **Summarise in a few lines:** where the work stands, what is waiting on someone, and the next step.
3. **Recommend** the next step with the reason, then **wait** for the go-ahead before changing anything.

Do not redo what "Tried and failed" lists unless something has changed since; say what.
