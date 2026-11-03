---
name: ticket-to-pr
description: Runs one ticket from the board to an open, reviewed pull request, with agents at every stage - plan, architect review, build, verify, pull request, specialist reviews. Started by a person with the ticket key, e.g. /ticket-to-pr ACME-106. A person merges.
disable-model-invocation: true
argument-hint: <ticket key>
---

# Ticket to pull request: $ARGUMENTS

You run the whole loop for $ARGUMENTS with no person in between, except where this file says stop. The plan file
The ticket's plan (`.ai-plans/*_$ARGUMENTS_*.md`) is the run's memory: write every verdict and every step to its log.

**Stop and report** (what was done, where it stopped, what is needed) when:

- the plan has an open product question, or a screen with no design and no pick yet (step 1);
- the architect sends the plan back a second time;
- a step's check fails three times;
- a reviewer's finding is still open after two rounds of fixes;
- anything would need a committed migration edited, a secret, a force-push, or a push to `main` or a `lab/` branch.

## 1. Branch and plan

1. Note the branch you are on (the base for the pull request), then `git switch -c $ARGUMENTS`. Commits, pushes and
   pull requests run only on a branch named after a ticket; a hook refuses them anywhere else.
2. Read `.claude/skills/implement-ticket/SKILL.md` and follow its "Start, or resume" section to write the plan:
   questions first, then requirements, decisions, shape, and steps each with its check. If the plan file already exists,
   read it and continue from where its log stops.
3. **The questions gate.** If the Questions section is not "None", post the questions on the ticket with
   `add_comment` ("Questions before we build: …") and stop. A product owner answers on the ticket; the next
   `/ticket-to-pr $ARGUMENTS` reads the answers first. Never answer a product question yourself, and never move one
   into Decisions to keep going.
4. **The design gate.** If the plan's Design is "Open", commit the prototypes in `docs/prototypes/$ARGUMENTS/`, post
   them on the ticket with `add_comment` (each file, the one choice it shows, your recommendation first) and stop,
   with the questions if there are any. The next run reads the pick from the ticket and records it. A design that is
   "Given" or "Follows" an existing screen goes on without stopping.

## 2. Architect review

Start the **architect** subagent with the ticket key and the plan's path, and nothing else. It returns `APPROVED` or
`CHANGES` with findings. Fix the plan and send it again. An approved plan is the go-ahead the `implement-ticket` skill
would otherwise ask a person for.

## 3. Build

Follow the `implement-ticket` skill's "Work" section: one step at a time, run its check, tick it, log it. After each
step that passes, have the **git** subagent commit it (`$ARGUMENTS: <what the step did>`).

## 4. Verify and open the pull request

1. Run the `verify-ticket` skill. It runs the gate, the verifier and the clean-code-reviewer, writes
   `docs/evidence/$ARGUMENTS.md`, comments on the ticket and moves it to `in-review`.
2. Have the **git** subagent push the branch (`git push -u origin $ARGUMENTS`) and open the pull request into the base
   branch from step 1: `gh pr create --base <base> --title "$ARGUMENTS: <title>" --body-file <file>`, the body being
   the plan's requirements, the decisions the ticket left open (the plan's Decisions), the evidence table, and what
   the checks don't prove.

## 5. Specialist reviews

Start, in parallel, each reviewer whose area the diff touches, each with the ticket key:

- **security-reviewer**: authentication, permissions, user input, file uploads, or a query built from input.
- **performance-reviewer**: a query, a list or an export, or anything done per row.
- **test-reviewer**: always.

The clean-code-reviewer already ran in `verify-ticket`; run it again only if the code changed since.

**Check before you post.** For each `blocking` finding, open the file and line it cites and read what the code does.
A finding the code plainly contradicts is not posted: record it in `docs/lessons/reviewers.md` under "Wrong", with
that code, and list it in the hand-over so a person can disagree. Drop a finding only because the code shows it is not
true, never because fixing it is work.

Post all the reports in one comment, as a "Review round" (`.claude/skills/ticket-to-pr/pr-comments.md`). Then work
through every `blocking` and `should-fix` finding this change `introduced` (the ones `already there` stay open for a
person) by following steps 3 to 5 of `.claude/skills/resolve-pr-comments/SKILL.md`: judge each one, fix the real ones
everywhere the same mistake appears, and answer the rest.

**The next round** runs only the reviewer whose finding was fixed, and gives it two things: the commits since its last
review (`git diff <last reviewed commit>...HEAD`), and the findings already answered. It reviews only that new code,
and never posts an answered finding again. A `REJECT` stops the run: hand it to a person.

## 6. Hand over

Stop. Report, so a person can judge the work rather than trust it:

- the pull request link and the evidence file;
- **the decisions you took that the ticket did not**: each line of the plan's Decisions (a default, a scope, a choice
  between two readings of the ticket), so a person can disagree before it merges;
- **what the checks don't prove**, from the evidence file;
- each reviewer's verdict, anything left open, and every finding you did not post or answered as wrong, with the code
  that shows why.

**A person checks that it works and merges**; the hook refuses `gh pr merge`. After the merge, `/qa-ticket $ARGUMENTS`
tests the merged build and files a bug for each failure.
