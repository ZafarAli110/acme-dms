# Lab 08: Plans, saved progress and checkpoints

**Branch:** `lab/08-plans` · **Before:** `lab/07-verification` · **Next:** `lab/09-export-before`

## What this branch adds

- The `ticket` skill (`/ticket <KEY>`): takes a ticket from To Do to a verified change, keeping a plan in
  `docs/plans/<KEY>.md`: open questions, requirements as a checklist, decisions, the shape of the change, steps with
  their checks, a log.
- A session-start hook (`.claude/hooks/open-plans.ts`) lists the plans that still have unchecked steps.

## Try it

1. Open `docs/plans/README.md` (the template) and `.claude/skills/ticket/SKILL.md`.
2. With the tracker running, start `claude` and type `/ticket ACME-105`. Stop when it has written
   `docs/plans/ACME-105.md` and asked its questions; read the plan.
3. Quit, start `claude` again: the hook lists the plan, and the work can carry on from the file.
4. Two tickets at once, each in its own folder (the same in PowerShell):

   ```bash
   git worktree add -b ACME-103 ../acme-103
   cd ../acme-103
   bun install
   claude
   ```

   Then `/ticket ACME-103` there and `/ticket ACME-104` in this folder.

## What to notice

- The plan survives `/compact`, a restart, another model or another person. It is committed, so it travels with the
  branch and the reviewer reads it next to the diff.
- About 150 lines at most: a plan is for a person to read.

## Cost

Step 2 to the plan: moderate. Step 4 runs two tickets: large. Stop each at its plan unless you mean to build it.
