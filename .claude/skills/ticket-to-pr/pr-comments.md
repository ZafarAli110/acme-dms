# Comments the agent posts on a pull request

The agent and the person who runs it post from the same GitHub account, so an agent's comment can only be told from
a person's by how it starts and ends. Every comment the agent posts has this header and footer, with the name from
`git config user.name`:

```
**<name> & Claude Code**

<content>

---
🤖 *Claude Code · run by <name>*
```

A comment without the footer is a person's. Post with `gh pr comment <number> --body-file <file>`: one comment per
step, never one per finding.

## A review round

All the reviewers of one round in one comment, each report as the reviewer returned it. Give every id the reviewer's
prefix, so ids are unique in the round: `CLEAN` clean code, `SEC` security, `PERF` performance, `TEST` tests.

```
## Review round 1

### security-reviewer
Verdict: APPROVE-WITH-CHANGES · 1 blocking / 1 should-fix

- [ ] **SEC-B1** blocking · introduced · `file:line` · <area> — <finding> — checked. Fix: <one sentence>
- [ ] **SEC-S1** should-fix · already there · `file:line` · <area> — <finding> — inferred. Fix: <one sentence>

### test-reviewer
Verdict: APPROVE · 0 blocking / 0 should-fix
```

## Resolved

After fixing, one comment that answers everything the run worked on:

```
## Resolved in <short commit hash>

- [x] **SEC-B1** blocking · introduced · … (copied from the round, now ticked: fixed)
- [ ] **PERF-S1** should-fix · introduced · … — wrong: `export-job-runner.ts:213` already streams the rows through a cursor
- [ ] **TEST-S2** should-fix · introduced · … — intended: the ticket asks for the old order to stay (requirement 3)
- [ ] **CLEAN-S1** should-fix · introduced · … — not worth it: the list is capped at 10 photos
- [ ] **SEC-S1** should-fix · already there · … — left for a person: it was already there

### Your comments
> <the first line of the person's comment>

Changed <what changed, in one or two sentences>.

### Skipped
- <the comment or id> — <why: unclear, outside the ticket, or against a standard>
```

The newest "Resolved" comment holds the checklist as it now stands; the next run starts from it.

- Say what changed, not what the problem was: the comment already says that.
- Never write "Done", "Fixed", "as requested" or "great catch" on their own; they tell the reader nothing.
- Only tick a box whose finding you fixed. Every other finding gets its answer after the dash: `wrong`, `intended`,
  `not worth it` or `left for a person`, each with its reason, and `wrong` with the code that shows it.
- Never untick a box, never reword a finding, and never post a finding again once it has been answered.
