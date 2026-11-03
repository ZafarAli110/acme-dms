---
name: resolve-pr-comments
description: Works through a pull request's open review comments and the agent's unticked review findings - fixes each one, pushes, and answers them all in one comment. Started by a person with the pull request number, e.g. /resolve-pr-comments 12.
disable-model-invocation: true
argument-hint: "[pull request number]"
---

# Resolve pull request comments: #$ARGUMENTS

Read `.claude/skills/ticket-to-pr/pr-comments.md` first: it is the format of every comment you post. Use the GitHub
CLI's pull request commands (`gh pr view`, `gh pr comment`), not `gh api`.

## 1. Find the pull request

`$ARGUMENTS`, or the current branch's: `gh pr view --json number,url,headRefName`. Its branch must be a ticket branch
(`ACME-…`) and checked out here; if not, stop and say so.

## 2. Collect what is open

`gh pr view <number> --json comments,reviews`. Then:

- **The agent's findings:** in the newest comment with the agent's footer and `- [ ]` lines, every unticked finding
  is open, except one marked `already there`: that waits for a person.
- **People's comments:** every comment and review summary without the footer, posted after the agent's newest
  "Resolved" comment. Each one is open.

A comment on a single line of the diff can't be read with these commands: ask reviewers to write in the review
summary or a comment, and name the file and line. If nothing is open, say so and stop. Otherwise print the list once
(the id or the author, the file and line, the first line) and carry on without waiting.

## 3. Fix each one

In order, for each:

1. Read the comment, the file it names in full, and the standards it touches.
2. Make the change it asks for, the way the standards say.
3. Note, in one or two sentences, what changed.

Skip one that is unclear, asks for something outside the ticket, or goes against a standard, and note why: a person
decides those. Don't stop to ask.

## 4. Prove it, commit, push

`bun run gate:fast` passes. Then have the **git** subagent commit (`<KEY>: address review comments on #<number>`)
and push (`git push -u origin <KEY>`).

## 5. Answer, in one comment

One `gh pr comment <number> --body-file <file>` in the "Resolved" format: the checklist with each fixed box ticked, a
short answer under each person's comment, and what was skipped and why.

## 6. Report

The commit, the link to the comment, what was fixed, what was skipped and why.
