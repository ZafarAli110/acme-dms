# Lab 00: The starting point

**Branch:** `lab/00-start` · **Next:** `lab/01-claude-md`

## What this branch is

Acme DMS with no harness: no `CLAUDE.md`, no written standards, no hooks, no skills. The lint rules and the commit
hook (`scripts/pre-commit.ts`) are already here, because a codebase enforces some rules on its own.

## Try it

1. Start Claude with nothing loaded: `claude --safe-mode`. Type `/context`: no memory files, no skills.
2. Open the board (acme-tracker, `bun start`, then http://localhost:4100) and copy ticket ACME-101.
3. Type `Implement this ticket:` and paste it. Only watch: what it opens, what it runs, what it decides.
4. When it says it is done, read its summary, then the diff (`git diff --stat`).

## What to notice

- What did it run to check its work, and what did it assume without checking?
- What did it change that nobody asked for?

## Cost

Step 3 builds a whole ticket: the most expensive thing in these labs. If you only want to see the idea, stop it after
its first few steps (Esc).

## Afterwards

Keep the run on a branch of its own before you switch (the same in PowerShell):

```bash
git switch -c run/bare-101
git add -A
git commit --no-verify -m "ACME-101 bare run"
git switch lab/01-claude-md
```

## All the labs

| Branch                 | Adds                                                      |
| ---------------------- | --------------------------------------------------------- |
| `lab/00-start`         | nothing: the bare agent                                   |
| `lab/01-claude-md`     | `CLAUDE.md` and the written standards in `docs/`          |
| `lab/02-mcp`           | the tracker as a tool (MCP)                               |
| `lab/03-hooks`         | hooks: rules that run every time                          |
| `lab/04-subagents`     | a verifier and a reviewer with their own context          |
| `lab/05-permissions`   | what Claude may run, must ask about, or never runs        |
| `lab/06-skills`        | skills: steps loaded only when a task needs them          |
| `lab/07-verification`  | `/verify-ticket`: evidence anyone can re-run              |
| `lab/08-plans`         | `/implement-ticket` and plan files that survive a restart |
| `lab/09-export-before` | take-home: QA, lessons and learning, before ACME-108      |
| `lab/09-export-after`  | the same, after ACME-108 was built                        |
| `lab/09-export-final`  | ACME-108 finished, with a job queue for exports           |
| `lab/10-ticket-to-pr`  | `/ticket-to-pr`: one ticket to a reviewed pull request    |

Each branch has its own `LAB.md`. The labs build on each other: anyone who falls behind switches to the next branch and
carries on.
