# Lab 10: From ticket to pull request

**Branch:** `lab/10-ticket-to-pr` · **Before:** `lab/09-export-after`

This branch adds a package: run `bun install` once after switching. A pull request needs your GitHub account, once:
`gh auth login`.

## What this branch adds

- `/ticket-to-pr <KEY>`: one ticket from the board to an open, reviewed pull request: plan, `architect` review, build,
  verify, pull request, then the specialist reviewers. Only you start it; a person merges.
- Reviewers in `.claude/agents/`: `security-reviewer`, `performance-reviewer`, `clean-code-reviewer`,
  `test-reviewer`, each only where the diff touches its area. A `git` subagent on a small model commits and pushes.
- `/resolve-pr-comments <number>`: fixes a pull request's open comments, pushes, and answers them in one comment.
- A mod, `.claude/skills/run-meter/`: a line above the prompt with the time, the estimated cost, the tokens, the model
  calls and the subagents running now. `/run-meter` sets it to zero; `/run-meter hide` hides it.

## Try it

1. Open `.claude/skills/ticket-to-pr/SKILL.md` and `.claude/agents/architect.md`.
2. `bun run reset`, start the tracker, then in Claude `/run-meter` (to count from zero) and `/ticket-to-pr ACME-106`.
   Answer what it asks on the ticket.
3. Read the pull request it opens: the plan, the evidence, the reviewers' comments.
4. Leave a review comment on the pull request yourself, then `/resolve-pr-comments <number>`.

## What to notice

- The architect may approve the technical plan; only the product owner answers a product question.
- Reviewers from one model family share blind spots: a person still reads the diff and merges.

## Cost

The largest single command in the labs: several agents across a whole ticket. Run it once, and read what it spent.
A pull request needs a repository you can push to: push your clone to your own repository first.
