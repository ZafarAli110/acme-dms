---
name: resolve-pr-comments
description: Works through a pull request's open review comments and the agent's unticked review findings - checks whether each is real, fixes the real ones, answers the rest with the evidence, pushes, and replies to them all in one comment. Started by a person with the pull request number, e.g. /resolve-pr-comments 12.
disable-model-invocation: true
argument-hint: "[pull request number]"
---

# Resolve pull request comments: #$ARGUMENTS

Read `.claude/skills/ticket-to-pr/pr-comments.md` first: it is the format of every comment you post. Use the GitHub
CLI's pull request commands (`gh pr view`, `gh pr comment`), and `gh api` only for the one call in that file that
updates the review round.

## 1. Find the pull request

`$ARGUMENTS`, or the current branch's: `gh pr view --json number,url,headRefName`. Its branch must be a ticket branch
(`ACME-…`) and checked out here; if not, stop and say so.

## 2. Collect what is open

`gh pr view <number> --json comments,reviews`. Then:

- **The agent's findings:** in the newest comment with the agent's footer and `- [ ]` lines, every unticked finding
  is open. One marked `already there` is not fixed in this pull request: it gets a follow-up ticket (step 3).
- **People's comments:** every comment and review summary without the footer, posted after the agent's newest
  "Resolved" comment. Each one is open.

A comment on a single line of the diff can't be read with these commands: ask reviewers to write in the review
summary or a comment, and name the file and line. If nothing is open, say so and stop. Otherwise print the list once
(the id or the author, the file and line, the first line) and carry on without waiting.

## 3. Judge each one, then fix it or answer it

A reviewer can be wrong, and a finding that sounds sure is not proof. In order, for each:

1. Read the comment, the file it names in full, and the standards it touches.
2. **Decide from the code, not from the comment's tone**, which of these it is:
   - **real**: the code does what the finding says, and it matters. Make the change, the way the standards say, and
     fix every place the same mistake appears in the diff, not only the line named.
   - **wrong**: the code does not do what the finding says. Change nothing; the answer quotes the code that shows it
     (`file:line`, and what that line really does).
   - **intended**: true, but on purpose: the ticket, a standard or a comment in the code asks for it. Change nothing;
     the answer names where.
   - **not worth it**: true and harmless here, at the sizes this system has. Change nothing; say why. A person may
     disagree.
   - **real, but not this ticket**: `already there`, or the fix needs a migration or a wider change. Change nothing
     here; create a follow-up ticket for it (`pr-comments.md`, "A real finding outside this ticket becomes a ticket")
     and answer `left open`, with its key.
3. Note, in one or two sentences, what changed or why nothing did.

Skip one that is unclear, asks for something outside the ticket, or goes against a standard, and note why: a person
decides those. Don't stop to ask.

## 3a. Record what the reviewers got wrong, and what they missed

In `docs/lessons/reviewers.md` (its format is at the top of the file):

- each agent finding you judged **wrong**, under "Wrong": the reviewer, the finding, why it was wrong, the evidence;
- each **real** bug a person's comment found that no reviewer flagged, under "Missed": the bug, and what the reviewer
  did not have in front of it (a rule nobody wrote down, a file it did not read, a check that does not exist).

This file is how the reviewers learn: they read it before every review, and `/learn-from-lessons` turns what repeats
into their instructions.

## 4. Prove it, commit, push

`bun run gate:fast` passes. Then have the **git** subagent commit the fixes and `docs/lessons/reviewers.md`
(`<KEY>: address review comments on #<number>`) and push (`git push -u origin <KEY>`).

## 5. Answer

As `pr-comments.md` "Resolved" says: first update the review round in place (each fixed box ticked, every other one
answered after it), then one `gh pr comment <number> --body-file <file>`: the checklist, a "Left open" list (each with
its reason and its follow-up ticket or the person who decides), a short answer under each person's comment, and what
was skipped and why.

## 6. Report

The commit, the link to the comment, what was fixed, what was answered as wrong, intended or not worth it, what was
left open (with its follow-up ticket), what was skipped and why, and what was added to `docs/lessons/reviewers.md`.
