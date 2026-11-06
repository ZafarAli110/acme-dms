# The harness

Everything around the model that makes Claude Code work well on Acme DMS, in one place: what each piece does, when it
runs, who starts it, and the lab that added it. Nothing here is loaded into Claude's context; it is for people.

## A ticket's life

```
/implement-ticket or /ticket-to-pr
  → plan in .ai-plans/ → one architect round → questions on the ticket, if any
  → build, one step and its check at a time (hooks format each file; the gate runs when Claude stops)
  → /verify-ticket → docs/evidence/<KEY>.md
  → pull request → specialist reviewers → /resolve-pr-comments
  → /qa-ticket: In QA, test plan on the ticket, a browser you can watch, screenshots, then Done or back
  → a person merges
  → /write-retro → /learn-from-lessons
```

## Always loaded

| Piece                         | What it does                                                                                      | Lab |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | --- |
| `CLAUDE.md`                   | what the project is, the rules for every change, how to work, the commands, what done means       | 01  |
| `.claude/rules/git-policy.md` | the reasons behind the git permissions: commit, push and pull request rules                       | 05  |
| `.claude/rules/web.md`        | the web rules; loads only when Claude works on a file under `web/`                                | 06  |
| `docs/standards/`             | the written standards `CLAUDE.md` points to: read when a change touches them, not loaded up front | 01  |

## Skills

A skill is a set of steps Claude loads only when a task needs it; until then only its one-line description costs
anything. The ones marked **you** are started by a person (`/name`); the others Claude loads when a task matches.

| Skill                      | Started by | What it does                                                                      | Lab |
| -------------------------- | ---------- | --------------------------------------------------------------------------------- | --- |
| `build-form-page`          | Claude     | builds or changes a create or edit page with a form                               | 06  |
| `build-api-endpoint`       | Claude     | adds or changes an API endpoint, from the data's scope to the test                | 06  |
| `upload-files`             | Claude     | a record with its files: the endpoint, the rules, storage, the form               | 06  |
| `call-other-service`       | Claude     | dealership-api calling document-api or identity-api through a typed client        | 06  |
| `check-in-browser`         | Claude     | checks a screen in a real browser, with screenshots at two widths                 | 07  |
| `export-large-list`        | Claude     | an Excel or CSV export of a list that can be large                                | 10  |
| `/verify-ticket <KEY>`     | you        | evidence anyone can re-run: the gate, the verifier, screenshots, `docs/evidence/` | 07  |
| `/implement-ticket <KEY>`  | you        | ticket to verified change, through a plan file that survives a restart            | 08  |
| `/write-handoff`           | you        | a short note of where you stopped, in `.claude/handoff.md` (not committed)        | 08  |
| `/resume-handoff`          | you        | a fresh session reads the note, checks it, and waits for your go-ahead            | 08  |
| `/qa-ticket <KEY>`         | you        | In QA, a test plan on the ticket, a watched browser, screenshots; Done or back    | 09  |
| `/write-retro <KEY>`       | you        | what the ticket taught, as lessons with evidence, in `docs/lessons/`              | 09  |
| `/learn-from-lessons`      | you        | proven lessons become skills; reviewers' mistakes become their instructions       | 09  |
| `/ticket-to-pr <KEY>`      | you        | the whole loop with agents, from the board to a reviewed pull request             | 10  |
| `/resolve-pr-comments <n>` | you        | judges each review comment, fixes the real ones, answers the rest                 | 10  |

## Subagents

A subagent works in a context of its own and hands back only its report. None of them changes code, except `git`,
which only commits and pushes. No model named: it uses the session's.

| Subagent               | Model     | What it does                                                                         | Lab |
| ---------------------- | --------- | ------------------------------------------------------------------------------------ | --- |
| `verifier`             | session's | checks a finished change in the running system, with evidence                        | 04  |
| `clean-code-reviewer`  | session's | reviews a diff against `docs/standards/` and `CLAUDE.md`                             | 04  |
| `architect`            | Opus      | reviews a plan before any code; the technical plan only, never a product question    | 08  |
| `qa`                   | session's | tests a finished ticket like a tester, from the ticket, and files bugs               | 09  |
| `security-reviewer`    | Sonnet    | every diff, all ten OWASP Top 10 categories, every file type; says what each came to | 10  |
| `performance-reviewer` | Sonnet    | the diff against real data sizes; backs a query finding with its plan                | 10  |
| `test-reviewer`        | Sonnet    | whether the tests would catch the bug they are meant to catch                        | 10  |
| `git`                  | Haiku     | commits, pushes, opens the pull request; never resolves a conflict                   | 10  |

## Hooks

A hook is a script Claude Code runs at a fixed moment, every time: it cannot be talked out of it.

| Hook               | When                   | What it does                                                                          | Lab |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------- | --- |
| `protect-files.ts` | before an edit         | refuses `.env` files and migrations already committed                                 | 03  |
| `format-file.ts`   | after an edit          | formats the file, so formatting is never a review comment                             | 03  |
| `gate.ts`          | when Claude stops      | runs the fast gate; on a failure, Claude carries on working                           | 03  |
| `open-plans.ts`    | when a session starts  | lists the plans not done yet, and says when a handoff note waits                      | 08  |
| `ticket-branch.ts` | before a shell command | commits, pushes and pull requests only on a ticket branch (`ACME-106`); never a merge | 10  |

Beside them, two git hooks hold for people and agents alike: `.githooks/pre-commit` (the checks) and
`.githooks/commit-msg` (a first line of at most 100 characters).

## Permissions

`.claude/settings.json`, from lab 05: **allow** runs without asking (the checks, `git status`, `bun run api`),
**ask** stops for a yes (`bun run reset`, installs, changing a skill or an agent), **deny** never runs (`git push` to
`main` or a lab branch, `gh pr merge`, `rm -rf`, `.env` files, Docker). The lists hold in every mode, auto mode
included.

## Tools and helpers

| Piece                            | What it does                                                                | Lab |
| -------------------------------- | --------------------------------------------------------------------------- | --- |
| `.mcp.json`: acme-tracker        | the board as tools: read a ticket, move it, comment, file a bug             | 02  |
| `bun run api as <user> …`        | calls the running system as a demo user (`--body`: the JSON alone)          | 00  |
| `bun run sql:explain "<select>"` | how Postgres runs a query on the running data, read-only                    | 00  |
| cost-meter plugin                | the cost, tokens and every subagent's cost while a run goes (`/show-meter`) | 10  |

## What the harness writes

| Folder                   | Written by                             | Holds                                                                     |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------- |
| `.ai-plans/`             | `/implement-ticket`, `/ticket-to-pr`   | one plan per ticket, from `plan-template.md`                              |
| `docs/prototypes/<KEY>/` | the design gate                        | two or three static prototypes when a screen has no design                |
| `docs/evidence/`         | `/verify-ticket`                       | each requirement, the command that checks it, and what it returned        |
| `docs/qa/`               | `/qa-ticket`                           | the test cases and what happened (and on the ticket, with screenshots)    |
| `docs/lessons/`          | `/write-retro`, `/resolve-pr-comments` | lessons with evidence; `reviewers.md`: what reviewers got wrong or missed |
