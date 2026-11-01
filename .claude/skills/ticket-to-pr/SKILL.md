---
name: ticket-to-pr
description: Runs one ticket from the board to an open, reviewed pull request, with agents at every stage - plan, architect review, build, verify, pull request, specialist reviews. Started by a person with the ticket key, e.g. /ticket-to-pr ACME-106. A person merges.
disable-model-invocation: true
argument-hint: <ticket key>
---

# Ticket to pull request: $ARGUMENTS

You run the whole loop for $ARGUMENTS with no person in between, except where this file says stop. Start the session
with `claude --model opusplan`: Opus plans, Sonnet builds. The plan file `docs/plans/$ARGUMENTS.md` is the run's
memory: write every verdict and every step to its log.

**Stop and report** (what was done, where it stopped, what is needed) when:

- the plan has an open product question (step 1);
- the architect sends the plan back a second time;
- a step's check fails three times;
- a reviewer's finding is still open after two rounds of fixes;
- anything would need a committed migration edited, a secret, a force-push, or a push to `main` or a `lab/` branch.

## 1. Branch and plan

1. Note the branch you are on (the base for the pull request), then `git switch -c $ARGUMENTS`. Commits, pushes and
   pull requests run only on a branch named after a ticket; a hook refuses them anywhere else.
2. Read `.claude/skills/ticket/SKILL.md` and follow its "Start, or resume" section to write the plan: questions first,
   then requirements, decisions, shape, and steps each with its check. If the plan file already exists, read it and
   continue from where its log stops.
3. **The questions gate.** If the Questions section is not "None", post the questions on the ticket with
   `add_comment` ("Questions before we build: …") and stop. A product owner answers on the ticket; the next
   `/ticket-to-pr $ARGUMENTS` reads the answers first. Never answer a product question yourself, and never move one
   into Decisions to keep going.

## 2. Architect review

Start the **architect** subagent with the ticket key and the plan's path, and nothing else. It returns `APPROVED` or
`CHANGES` with findings. Fix the plan and send it again. An approved plan is the go-ahead the ticket skill would
otherwise ask a person for.

## 3. Build

Follow the ticket skill's "Work" section: one step at a time, run its check, tick it, log it. After each step that
passes, have the **git** subagent commit it (`$ARGUMENTS: <what the step did>`).

## 4. Verify and open the pull request

1. Run the `verify` skill. It runs the gate, the verifier and the standards-reviewer, writes
   `docs/evidence/$ARGUMENTS.md`, comments on the ticket and moves it to `in-review`.
2. Have the **git** subagent push the branch (`git push -u origin $ARGUMENTS`) and open the pull request into the base
   branch from step 1: `gh pr create --base <base> --title "$ARGUMENTS: <title>" --body-file <file>`, the body being
   the plan's requirements and the evidence table.

## 5. Specialist reviews

Start, in parallel, each reviewer whose area the diff touches, each with the ticket key:

- **security-reviewer**: authentication, permissions, user input, file uploads, or a query built from input.
- **performance-reviewer**: a query, a list or an export, or anything done per row.
- **test-reviewer**: always.

The standards-reviewer already ran in `verify`; run it again only if the code changed since. Fix what they find,
commit, push, and run again only the reviewer that found it. Post each reviewer's summary on the pull request with
`gh pr comment`.

## 6. Hand over

Stop. Report the pull request link, the evidence file, each reviewer's verdict, and anything left open. **A person
checks that it works and merges**; the hook refuses `gh pr merge`. After the merge, `/qa $ARGUMENTS` tests the merged
build and files a bug for each failure.
