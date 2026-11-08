# `.ai-observability/`: what the agent's sessions did

A harness gets better only if you can see what its sessions did. `bun run audit` reads the transcripts Claude Code
writes itself (`~/.claude/projects/<this folder>/`, subagents included), never what the agent says about its own work,
and writes here. Nothing in this folder is edited by hand.

```bash
bun run audit                  # the last 7 days
bun run audit --since 30       # the last 30 days
bun run audit --session c0b2   # one session, by the start of its id
bun run audit --json           # the whole scan on stdout; writes nothing
```

## What it measures

- **Drift:** did the standard or skill for a kind of code load **before** the first edit of that code? Web code wants
  `docs/standards/web-architecture.md` (or a web skill), a business handler `docs/standards/business-handlers.md` (or
  `build-api-endpoint`), data access `docs/standards/multi-tenancy.md`, and so on: the rules are `RULES` in
  `scripts/audit-sessions.ts`. "Late" means it loaded after the first edit; "missing", never. A wide sweep over few
  prompts (a rename) is reported as soft.
- **Cost:** the context at the first turn (what the harness costs before any work), at its peak and at the first edit;
  compactions; tool calls and minutes before the first edit; and the largest tool results read before it.

It is a report, not a gate. A drift finding is a read missing from a transcript, not proof: CLAUDE.md and a pasted
standard arrive without one. Read the finding, then fix the harness (a skill that names the standard, a hook) if it
keeps happening.

## The files, and what git keeps

| File                      | Kept by git? | Why                                                                |
| ------------------------- | ------------ | ------------------------------------------------------------------ |
| `session-audit-<time>.md` | No           | The full report. It quotes prompts and file paths                  |
| `session-audit-latest.md` | No           | A copy of the newest report                                        |
| `summary.jsonl`           | Yes          | One line per session, appended: ids, a date and counts, never text |
| `README.md`               | Yes          | This file                                                          |

Claude Code deletes transcripts after about 30 days, and the reports can no longer be made again; `summary.jsonl` is
what is left. Its fields are fixed in code (`summaryJson`), and a test fails if anything else, such as a prompt or a
path, reaches it.

A line is one observation: running the audit twice over the same days adds the same sessions twice. Count sessions by
`sessionId`. On a merge conflict in `summary.jsonl`, keep both sides.
