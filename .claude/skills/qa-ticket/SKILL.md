---
name: qa-ticket
description: Has the qa subagent test a ticket in the running system the way a tester would - test plan on the ticket first, then every case in a visible browser, results and screenshots on the ticket, a bug for each failure - and move it to Done or back. Use when asked to QA a ticket, e.g. /qa-ticket ACME-106, once it is implemented and verified, before a person merges it.
disable-model-invocation: true
---

# QA a ticket

**The ticket key, in any case.** `acme-106`, `Acme-106` and `ACME-106` are the same ticket: write it in capitals
everywhere it appears (the branch, the plan's name, commits, comments, the tracker).

QA tests what the ticket asks, in the running system, before a person merges: the last check, by someone who did not
build it.

1. **The right build is running.** `git branch --show-current` is the ticket's branch (or the pull request's), and
   `bun run status` shows the system up. dealership-api and web reload themselves; after a change to a .NET service,
   `bun run rebuild <service>` first. QA tests the running system, never the code.
2. **Start the qa subagent** with the ticket key and nothing else: no summary of the change, no hints. It moves the
   ticket to In QA, posts its test plan on the ticket, tests every case in a browser on screen, posts the results with
   a screenshot for each, files a bug for each failure, and moves the ticket on.
3. **Show its summary:** each case, PASS / FAIL / BLOCKED, the bugs it filed, and where the ticket now is.
4. **What next:**
   - **Done:** QA has accepted the change; a person reads the pull request and merges it.
   - **Back in In Progress:** each bug is fixed as its ticket says (`/implement-ticket <bug key>`), then QA runs again
     until every case passes.
   - **Still In QA:** a case was BLOCKED; the comment says what it needs (a service down, data missing).
5. When QA is clean, `/write-retro <KEY>`: what went wrong on the way is worth more than the passing test.
