---
name: ticket-to-pr
description: Runs one ticket from the board to an open, reviewed pull request, with agents at every stage - plan, architect review, build, verify, pull request, specialist reviews. Started by a person with the ticket key, e.g. /ticket-to-pr ACME-106. A person merges.
disable-model-invocation: true
argument-hint: <ticket key>
---

# Ticket to pull request: $ARGUMENTS

**The ticket key, in any case.** `acme-106`, `Acme-106` and `ACME-106` are the same ticket: write it in capitals
everywhere it appears (the branch, the plan's name, commits, comments, the tracker): below, `$ARGUMENTS` means that
key in capitals.

You run the whole loop for $ARGUMENTS with no person in between, except where this file says stop.
The ticket's plan (`.ai-plans/*_$ARGUMENTS_*.md`) is the run's memory: write every verdict and every step to its log.

**Stop and report** (what was done, where it stopped, what is needed) when:

- the plan has an open product question, or a screen with no design and no pick yet (step 1);
- a step's check fails three times;
- a reviewer's finding is still open after two rounds of fixes;
- anything would need a committed migration edited, a secret, a force-push, or a push to `main` or a `lab/` branch.

## 1. Branch and plan

1. Note the branch you are on (the base for the pull request), then `git switch -c $ARGUMENTS`. Commits, pushes and
   pull requests run only on a branch named after a ticket; a hook refuses them anywhere else.
2. Read `.claude/skills/implement-ticket/SKILL.md` and follow its "Start, or resume" section to write the plan:
   questions first, then requirements, decisions, shape, and steps each with its check. If the plan file already exists,
   read it and continue from where its log stops. Skip that section's last step (show the plan and wait for a
   go-ahead): in this run, people answer on the ticket, never in the terminal.
3. **The questions gate.** If the Questions section is not "None", post the questions on the ticket with
   `add_comment` ("Questions before we build: …") and stop. A product owner answers on the ticket; the next
   `/ticket-to-pr $ARGUMENTS` reads the answers first. Never answer a product question yourself, and never move one
   into Decisions to keep going.

   **An answer on the ticket is the go-ahead.** A comment by a person (the tracker shows it as "a person", not "an
   agent") after your questions answers them: a short reply such as "A" picks that option. Record each answer in
   Decisions with "answered on the ticket", log it, and carry on without asking again in the terminal. Stop again
   only for a question still unanswered, or an answer that is unclear: ask that one on the ticket.

4. **The design gate.** If the plan's Design is "Open", commit the prototypes in `docs/prototypes/$ARGUMENTS/`, post
   them on the ticket with `add_comment` (each file, the one choice it shows, your recommendation first) and stop,
   with the questions if there are any. The next run reads the pick from the ticket and records it. A design that is
   "Given" or "Follows" an existing screen goes on without stopping.

## 2. Architect review

Step 1 already ran the one architect round (`implement-ticket`, "One architect round, always"): the plan was fixed for
its findings and its verdict is in the Log. That round is the go-ahead the `implement-ticket` skill would otherwise ask
a person for. It is not run again. If it moved a product decision into Questions, the questions gate (step 1) has
already stopped the run.

## 3. Build

Follow the `implement-ticket` skill's "Work" section: one step at a time, run its check, tick it, log it. After each
step that passes, have the **git** subagent commit it (`$ARGUMENTS: <what the step did>`).

## 4. Verify and open the pull request

1. Run the `verify-ticket` skill. It runs the gate and the verifier, writes
   `docs/evidence/$ARGUMENTS.md`, comments on the ticket and moves it to `in-review`.
2. Have the **git** subagent push the branch (`git push -u origin $ARGUMENTS`) and open the pull request into the base
   branch from step 1: `gh pr create --base <base> --title "$ARGUMENTS: <title>" --body-file <file>`, the body being
   the plan's requirements, the decisions the ticket left open (the plan's Decisions), the evidence table, and what
   the checks don't prove.

## 5. Specialist reviews

Start, in parallel, each reviewer whose area the diff touches, each with the ticket key:

- **security-reviewer**: always. A secret in a config, personal data in a log line or a new package is a security
  finding in a diff that touches no endpoint.
- **state-reviewer**: anything that moves through stages: a status or lifecycle column, a job, queue or sweeper, a
  message sent or consumed, a lease, lock or retry, a cache or ETag, sign-in or sign-out, a kernel, a form or dialog
  that submits, or anything kept per tab.
- **performance-reviewer**: a query, a list or an export, or anything done per row.
- **test-reviewer**: always.
- **clean-code-reviewer**: always.

**Check before you post.** For each `blocking` finding, open the file and line it cites and read what the code does.
A finding the code plainly contradicts is not posted: record it in `docs/lessons/reviewers.md` under "Wrong", with
that code, and list it in the hand-over so a person can disagree. Drop a finding only because the code shows it is not
true, never because fixing it is work.

Post all the reports in one comment, as a "Review round" (`.claude/skills/ticket-to-pr/pr-comments.md`). Then work
through every `blocking` and `should-fix` finding by following steps 3 to 5 of `.claude/skills/resolve-pr-comments/SKILL.md`: judge each one, fix the real ones
everywhere the same mistake appears, and answer the rest.

**The next round** runs only the reviewer whose finding was fixed, and gives it two things: the commits since its last
review (`git diff <last reviewed commit>...HEAD`), and the findings already answered. It reviews only that new code,
and never posts an answered finding again. A `REJECT` stops the run: hand it to a person.

## 6. Hand over

First bring the plan up to date: Status, **Now** (the pull request, what is left and who acts next) and a Log line
for each review round, with the time from `date`. Have the **git** subagent commit and push it.

Then stop. Report, so a person can judge the work rather than trust it:

- the pull request link and the evidence file;
- **what was left open, and why**: each finding not fixed, with its reason and its follow-up ticket (or the person who
  decides), so nobody wonders whether it was skipped on purpose or the run broke off;
- **the decisions you took that the ticket did not**: each line of the plan's Decisions (a default, a scope, a choice
  between two readings of the ticket), so a person can disagree before it merges;
- **what the checks don't prove**, from the evidence file;
- each reviewer's verdict, anything left open, and every finding you did not post or answered as wrong, with the code
  that shows why.

**Then QA, then a person merges.** `/qa-ticket $ARGUMENTS` tests the branch in the running app, in a browser people
can watch, puts its test plan, results and screenshots on the ticket, and moves it to Done or back to In Progress. A
person merges after QA; the hook refuses `gh pr merge`.
