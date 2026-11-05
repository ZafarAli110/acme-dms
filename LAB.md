# Lab 04: Subagents

**Branch:** `lab/04-subagents` · **Before:** `lab/03-hooks` · **Next:** `lab/05-permissions`

## What this branch adds

Two subagents in `.claude/agents/`, each with its own context and its own tools, and neither changes code:

- `verifier`: checks that a finished change does what its ticket asks, in the running system.
- `clean-code-reviewer`: reviews a diff against `docs/standards/` and `CLAUDE.md`.

`CLAUDE.md` ("Done means") sends every finished ticket to both.

## Exercise

**Goal:** Have the clean-code-reviewer subagent review a diff in a context of its own.

1. Open `.claude/agents/verifier.md` and `clean-code-reviewer.md`: the front matter, then the instructions.
2. Start `claude` and type `/agents`: both are listed.
3. If you kept a run from lab 01 (`run/harness-101`), switch to it and prompt:
   `Use the clean-code-reviewer subagent to review the diff against lab/01-claude-md. Change nothing.`

   No `run/harness-101`? Review the agent's build of ACME-108 instead:
   `Use the clean-code-reviewer subagent to review git diff origin/lab/09-export-before origin/lab/09-export-after -- backend. Change nothing.`

## What to notice

- Fresh eyes: the reviewer does not share the author's assumptions, and only its summary comes back.
- Not free: a subagent starts its own conversation, so it does not reuse the main session's prompt cache.

## Cost

Step 3 is a review of one diff: moderate. Pay for a fresh read when fresh eyes are worth it.

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
git switch lab/05-permissions
```
