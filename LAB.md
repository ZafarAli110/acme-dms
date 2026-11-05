# Lab 08: Plans, saved progress and checkpoints

**Branch:** `lab/08-plans` · **Before:** `lab/07-verification` · **Next:** `lab/09-export-before`

## What this branch adds

- The `implement-ticket` skill (`/implement-ticket <KEY>`): takes a ticket from To Do to a verified change, keeping a
  plan in `.ai-plans/<date>_<KEY>_<name>.md`, copied from `.ai-plans/plan-template.md`: its status first, then the
  requirement, the acceptance criteria as the goal, the shape with high-level code, the steps with their checks;
  questions, decisions and the log last.
- One architect round on every plan: the `architect` subagent, which has not seen the conversation, reviews it
  once before you do; the plan is fixed and its verdict logged.
- A design gate in `/implement-ticket`: a screen the ticket shows is built from that design; one that follows an
  existing screen copies it; an open one gets two or three static prototypes in `docs/prototypes/<KEY>/` and a pick
  before any UI code.
- A session-start hook (`.claude/hooks/open-plans.ts`) lists the plans that still have unchecked steps, and says when
  a handoff note is waiting.
- `/write-handoff` and `/resume-handoff`: a short note of where your session stopped (`.claude/handoff.md`, not
  committed), and a fresh session that reads it, checks it against the repository and waits for your go-ahead.

## Exercise

**Goal:** Plan ACME-105 with `/implement-ticket`, restart Claude, and carry on from the plan file.

1. Open `.ai-plans/plan-template.md` (every plan's shape) and `.claude/skills/implement-ticket/SKILL.md`.
2. With the tracker running, start `claude` and type `/implement-ticket ACME-105`. Stop when it has written
   its plan in `.ai-plans/` and asked its questions; read the plan.
3. Quit, start `claude` again: the hook lists the plan, and the work can carry on from the file.
4. Two tickets at once, each in its own folder (the same in PowerShell):

   ```bash
   git worktree add -b ACME-103 ../acme-103
   cd ../acme-103
   bun install
   claude
   ```

   Then `/implement-ticket ACME-103` there and `/implement-ticket ACME-104` in this folder.

5. Before you stop: `/write-handoff`, then quit. Start `claude` again: the hook says a note is waiting; type
   `/resume-handoff` and compare its summary with what you remember.

## What to notice

- The plan survives `/compact`, a restart, another model or another person. It is committed, so it travels with the
  branch and the reviewer reads it next to the diff.
- About 200 lines, a soft limit: a plan is for a person to read.
- Two notes, two jobs: the plan is the ticket's record, committed and shared; the handoff is your session's, local
  and short. A note you wrote survives a new session; a summary the model wrote is its guess at what mattered.

## Cost

Step 2 to the plan: moderate. Step 4 runs two tickets: large. Stop each at its plan unless you mean to build it.

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
git switch lab/09-export-before
```
