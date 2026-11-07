# Lab 10: From ticket to pull request

**Branch:** `lab/10-ticket-to-pr` · **Before:** `lab/09-export-after`

This branch adds a package: run `bun install` once after switching. A pull request needs your GitHub account, once:
`gh auth login`.

Every piece of the harness, what it does and the lab that added it: `docs/HARNESS.md`.

## What this branch adds

- `/ticket-to-pr <KEY>`: one ticket from the board to an open, reviewed pull request: plan, `architect` review, build,
  verify, pull request, then the specialist reviewers. Only you start it; a person merges.
- Reviewers in `.claude/agents/`: `security-reviewer`, `performance-reviewer`, `clean-code-reviewer`,
  `test-reviewer`, each only where the diff touches its area. A `git` subagent on a small model commits and pushes.
- `/resolve-pr-comments <number>`: fixes a pull request's open comments, pushes, and answers them in one comment.

## Exercise

**Goal:** Take ACME-106 from the board to a reviewed pull request and through QA, and watch what it costs.

**Tickets:** ACME-108 is already built on this branch: don't pick it. ACME-115 is for the second exercise. The
others are open.

1. Open `.claude/skills/ticket-to-pr/SKILL.md` and `.claude/agents/architect.md`.
2. Install a plugin, once: the cost meter, which shows what the run costs while it runs. In Claude:

   ```
   /plugin install cost-meter --marketplace ZafarAli110/claude-code-cost-meter
   ```

   Answer `y`, pick the **user** scope, then `/show-meter` opens it beside the conversation.

3. A clean board: in `acme-tracker`, stop the tracker, `bun run reset`, then `bun start`. Here: Docker Desktop
   running, and `bun run dev`. Then in Claude: `/clear`, `/show-meter reset` and `/ticket-to-pr ACME-106`. Answer
   what it asks on the ticket. Watch the meter: each subagent appears as it runs, with its time, tokens and cost.
4. Read the pull request it opens: the plan, the evidence, the reviewers' comments.
5. Leave a review comment on the pull request yourself, then `/resolve-pr-comments <number>`.
6. `/qa-ticket ACME-106`: a browser opens and the tester works through its plan while you watch. On the board, the
   ticket moves to In QA, gets the test plan, then the results with a screenshot for each case, and moves to Done (or
   back to In Progress with a bug). Then a person merges.

## What to notice

- The architect may approve the technical plan; only the product owner answers a product question.
- Reviewers from one model family share blind spots: a person still reads the diff and merges.
- A plugin is how a team shares harness pieces across repositories: one install, and it works in every project.

## Exercise 2 (take-home): QA what is already built

**Goal:** QA a feature nobody changed, and find out what a tester needs to see that a clean test browser does not.

**Ticket:** ACME-115, signing out in every open tab. It is already built on this branch: QA it, don't build it.

1. On the board, move ACME-115 to **In Review**: it is ready to test.
2. Start the system (`bun run dev`) and the tracker. In Claude: `/clear`, `/show-meter reset`, then
   `/qa-ticket ACME-115`. Watch the plan it posts first, then the browser. When it asks to stop a service
   (`bun run resource`), read why before you answer.
3. Read its results on the ticket: for each case, what it saw on the screen, in the console, in the network, in the
   timings and in the services' traces. A PASS with no evidence is not a PASS.
4. Now test it yourself, in your own everyday browser, not a test one: open the app in three tabs, open the developer
   tools (Network, with **Preserve log** on, and Console), and sign out. Then do it again. Did you see anything QA did
   not?
5. Run `/qa-ticket ACME-115` twice more, moving it back to In Review each time. Its browser keeps its profile between
   runs: does what it finds change?

### What to notice

- A test browser starts empty; a user's never is. Some bugs only show in a browser that has been used.
- The screen is the last place a problem shows: the console, the network log, the timings and the traces show it
  first.
- QA finds what it tests for. When it misses something you found, what would it have needed to look at, and where does
  that belong: in the ticket, or in the qa agent's instructions?

## Cost

The largest single command in the labs: several agents across a whole ticket. Run it once, and read what it spent on
the cost meter.
A pull request needs a repository you can push to: push your clone to your own repository first.

Exercise 2: one QA run is one subagent and a browser, for a few minutes. Reset the meter before each run
(`/show-meter reset`) and compare the three: more evidence costs more tokens.

How to spend less, and what each model costs: the README's [Spending tokens wisely](README.md#spending-tokens-wisely).

## Next

This is the last lab. When you are done, close the pull request and delete its branch:

```bash
gh pr close <number> --delete-branch
```

Then `bun run reset` in acme-tracker for a clean board. Every piece of the harness, on one page: `docs/HARNESS.md`.
