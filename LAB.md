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

## Try it

1. Open `.claude/skills/ticket-to-pr/SKILL.md` and `.claude/agents/architect.md`.
2. Install a plugin, once: the cost meter, which shows what the run costs while it runs. In Claude:

   ```
   /plugin install cost-meter --marketplace ZafarAli110/claude-code-cost-meter
   ```

   Answer `y`, pick the **user** scope, then `/show-meter` opens it beside the conversation.

3. `bun run reset`, start the tracker, then in Claude `/show-meter reset` and `/ticket-to-pr ACME-106`. Answer what it
   asks on the ticket. Watch the meter: each subagent appears as it runs, with its time, tokens and cost.
4. Read the pull request it opens: the plan, the evidence, the reviewers' comments.
5. Leave a review comment on the pull request yourself, then `/resolve-pr-comments <number>`.

## What to notice

- The architect may approve the technical plan; only the product owner answers a product question.
- Reviewers from one model family share blind spots: a person still reads the diff and merges.
- A plugin is how a team shares harness pieces across repositories: one install, and it works in every project.

## Cost

The largest single command in the labs: several agents across a whole ticket. Run it once, and read what it spent on
the cost meter.
A pull request needs a repository you can push to: push your clone to your own repository first.
