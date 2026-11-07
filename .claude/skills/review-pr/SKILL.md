---
name: review-pr
description: Reviews a pull request already on GitHub with the five specialist reviewers - security, state, performance, tests, clean code - in parallel, checks each blocking finding against the code, and posts one review round on the pull request. It changes no code. Started by a person, e.g. /review-pr 12, a pull request's URL, or nothing to pick from the open ones.
disable-model-invocation: true
argument-hint: "[pull request number or URL]"
---

# Review a pull request: $ARGUMENTS

Read `.claude/skills/ticket-to-pr/pr-comments.md` first: it is the format of the comment you post. You review and
post; you never change, commit or push code. The author fixes with `/resolve-pr-comments <number>`.

## 1. Which pull request

- A number, or a URL (`…/pull/12`: the number is its end): that one.
- Nothing: `gh pr list --state open`. None: say so and stop. One: review it, and say which. More than one: list them
  and ask which. This is the only question you ask.

Then `gh pr view <number> --json number,title,body,url,baseRefName,headRefName,headRefOid,files`.

**The ticket.** A head branch named after a ticket (`ACME-106`, in any case) is that ticket: the reviewers read it
with `get_ticket` and its plan in `.ai-plans/`. Any other branch has no ticket: the pull request's title and body are
the requirement, and say so in the review.

## 2. The code to review, without touching this checkout

- **This checkout is already at the pull request's head** (`git rev-parse HEAD` is its `headRefOid`): review here. The
  reviewers can run what they need to prove a finding (a test, `sql:explain` on the running system).
- **Otherwise** read it in a worktree of its own, so your branch and your uncommitted work stay as they are. Fetch the
  pull request's head and the base, then add the worktree in the system's temporary folder (its absolute path is what
  `bun -e "console.log(require('node:os').tmpdir())"` prints, the same on Windows):

  ```
  git fetch origin <base> "pull/<number>/head"
  git worktree add --detach "<temp folder>/acme-pr-<number>" FETCH_HEAD
  ```

  It has no installed packages and nothing runs from it: reviewers read the code there, and a finding they could only
  prove by running it stays `— inferred`. To measure, run `gh pr checkout <number>` first and then `/review-pr` again.

## 3. The five reviewers, at once

Start all five in one message, so they run side by side: **security-reviewer**, **state-reviewer**,
**performance-reviewer**, **test-reviewer**, **clean-code-reviewer**. A pull request someone else wrote gets every one; a reviewer with nothing
in its area says so and approves. Give each:

- the ticket key, or "no ticket: the requirement is the pull request's title and body", with both;
- the folder to work in (this checkout, or the worktree's absolute path): every `git` command runs there
  (`git -C <folder> diff origin/<base>...HEAD`), and every file it reads is under it;
- the files the pull request changes, from `files`;
- "Return your report; don't post anything."

Subagents cannot start subagents, so this skill starts them itself rather than handing the review to one.

## 4. Check before you post

For each `blocking` finding, open the file and line it cites and read what the code does. A finding the code plainly
contradicts is not posted: record it in `docs/lessons/reviewers.md` under "Wrong", with that code. Drop a finding only
because the code shows it is not true, never because fixing it is work. The same finding from two reviewers is posted
once, under the first in this order: security, state, performance, tests, clean code.

## 5. Post one review round

All five reports in one comment, as a "Review round" (`pr-comments.md`), ids prefixed `SEC`, `STATE`, `PERF`,
`TEST`, `CLEAN`. If the pull request already has review rounds, this one is the next number, and an answered finding is not
posted again. Write the body to a file in the temporary folder and post it:
`gh pr comment <number> --body-file <file>`.

## 6. Tidy up and report

Remove the worktree if you added one (`git worktree remove --force "<temp folder>/acme-pr-<number>"`). Then, in the
chat: the pull request's URL, each reviewer's verdict, the blocking and should-fix counts, the link to the round's
comment, and what was dropped as wrong. Next for the author: `/resolve-pr-comments <number>`.
