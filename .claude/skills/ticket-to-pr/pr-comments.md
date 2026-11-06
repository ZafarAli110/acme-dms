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

After fixing, two things, in this order.

**1. Update the review round in place**, so its checklist is the one place a reader looks. Tick each finding you fixed
and add its answer after it; every box left unticked gets its answer too, so nobody has to guess whether it was skipped
on purpose or the run broke off. Find the round's comment id at the end of its `url` (`#issuecomment-<id>`) in
`gh pr view <number> --json comments`, write the whole updated body to a file, and replace it (the quotes matter:
PowerShell reads `{…}` as code):

```
gh api -X PATCH "repos/{owner}/{repo}/issues/comments/<id>" -F "body=@<file>"
```

```
- [x] **SEC-B1** blocking · introduced · … → fixed in a1b2c3d
- [ ] **PERF-S1** should-fix · already there · … → left open: needs a new migration, wider than this ticket. Follow-up: ACME-110
- [ ] **CLEAN-S1** should-fix · introduced · … → not worth it: the list is capped at 10 photos
```

**2. Post one "Resolved" comment** that says what this round did:

```
## Resolved in <short commit hash>

- [x] **SEC-B1** blocking · introduced · … (copied from the round, now ticked: fixed)
- [ ] **PERF-S1** should-fix · introduced · … — wrong: `export-worker.ts:332` already streams the rows through a cursor
- [ ] **TEST-S2** should-fix · introduced · … — intended: the ticket asks for the old order to stay (requirement 3)
- [ ] **SEC-S1** should-fix · already there · … — left open: it was already there. Follow-up: ACME-110

### Left open
- **SEC-S1** — what it would take, why not here, and who acts next: the follow-up ticket, or the person named

### Your comments
> <the first line of the person's comment>

Changed <what changed, in one or two sentences>.

### Skipped
- <the comment or id> — <why: unclear, outside the ticket, or against a standard>
```

The newest "Resolved" comment holds the checklist as it now stands; the next run starts from it.

- Say what changed, not what the problem was: the comment already says that.
- Never write "Done", "Fixed", "as requested" or "great catch" on their own; they tell the reader nothing.
- Only tick a box whose finding you fixed. Every other finding gets its answer: `wrong`, `intended`, `not worth it`
  or `left open`, each with its reason, `wrong` with the code that shows it, and `left open` with its follow-up
  ticket or the person who decides.
- **A real finding outside this ticket becomes a ticket.** One that is `already there`, or needs a migration or a
  wider change: check `list_tickets` for one that covers it, otherwise `create_ticket` (a `bug` for wrong behaviour, a
  `story` otherwise) whose description starts `Found while reviewing <KEY> (#<number>).`, then the finding, its
  evidence (the query plan, the command and what it returned) and the proposed fix. Link its key in the answer.
- Never untick a box and never reword a finding: in the round you only tick and add the answer after it.
