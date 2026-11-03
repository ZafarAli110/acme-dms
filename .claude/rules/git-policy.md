# Git

`.claude/settings.json` enforces these rules; this file says why. If the two ever disagree, the settings win, and the
disagreement is a bug to report.

- **Commit: ask first**, except in a ticket run (below). Finish, run `bun run gate:fast`, say what changed, then ask.
  A commit is what the team will see, not a backup: uncommitted work in the tree is not lost.
- **Push: only in a ticket run.** Otherwise a person pushes.
- **Stage by name:** the files you changed, never `git add -A` or `git add .`.
- **Commit message: one line, at most 100 characters**, saying what changed, e.g.
  `ACME-107: save a part and its photos`. Detail belongs in the pull request. The `commit-msg` hook refuses a longer
  first line.
- **Never** `git reset --hard` or `git clean`: they throw away work nobody can get back.
- **Never** `--no-verify`. If the pre-commit check fails, fix what it found.

## In a ticket run

`/ticket-to-pr` and `/resolve-pr-comments` are started by a person, for one ticket, on its branch (`ACME-…`). Inside
them, and only there, the **git** subagent commits each step that passes its check and pushes that branch
(`git push -u origin ACME-…`) without asking: the person approved the run by starting it, and every step is checked
before it is committed.

Never, in a run or not: push to `main` or a `lab/` branch, force-push, or merge a pull request. A person merges.
