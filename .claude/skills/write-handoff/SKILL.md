---
name: write-handoff
description: Writes a short note of where this session stopped, so a fresh session (yours tomorrow, after /clear, or at 60-70% context) picks up without a summary of the conversation. Started by a person, e.g. /write-handoff, before ending a session.
disable-model-invocation: true
---

# Handoff: write down where you stopped

Replace `.claude/handoff.md` (not committed: it is your session's note, one per checkout or worktree) with what the
next session needs to act. A ticket's plan (`.ai-plans/*_<KEY>_*.md`) is the record of the ticket and is committed; the
handoff points to it and holds only what the plan does not.

## Check reality first

`git status`, `git branch --show-current`, `git log --oneline -5`, and the open plans (`.ai-plans/`). Write what is
true now, not what was planned. If something was run, say what it returned.

## The note: fixed shape, replaced, at most 60 lines

```markdown
# Handoff

Updated: <date> · Branch: <branch> · Last commit: <short hash and subject> · Plan: <its file in .ai-plans/, or none>

## Where we are

- <at most 5 bullets: what is done, what is half-done, what is uncommitted>

## Next, in order

1. <a concrete step: the file, command or question it concerns>

## Tried and failed

- <what was tried, what happened, why it was dropped: so the next session does not try it again>

## Waiting on someone

- <a decision or an answer only a person can give, and who>
```

## Rules

- Every line is something the next session needs in order to act. What is only interesting is left out.
- Never a secret, a token or a password.
- A lasting rule you learned does not stay in the handoff: say where it belongs (`CLAUDE.md`, a skill, a standard)
  and ask before writing it there.
- Do not commit the note; it is listed in `.gitignore`.
