# Git

`.claude/settings.json` enforces these rules; this file says why. If the two ever disagree, the settings win, and the
disagreement is a bug to report.

- **Commit: ask first.** Finish, run `bun run gate:fast`, say what changed, then ask. A commit is what the team will
  see, not a backup: uncommitted work in the tree is not lost.
- **Push: never.** A person pushes.
- **Stage by name:** the files you changed, never `git add -A` or `git add .`.
- **Never** `git reset --hard` or `git clean`: they throw away work nobody can get back.
- **Never** `--no-verify`. If the pre-commit check fails, fix what it found.
