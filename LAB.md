# Lab 05: Permissions

**Branch:** `lab/05-permissions` · **Before:** `lab/04-subagents` · **Next:** `lab/06-skills`

## What this branch adds

- `.claude/settings.json` gets three lists: **allow** (runs without asking: the checks, `git status`, `git diff`),
  **ask** (asks you first: `git commit`, `bun run reset`, installs) and **deny** (never: `git push`, `rm -rf`, `.env`
  files, Docker).
- `.claude/rules/git-policy.md`: the reasons behind the git lines, loaded at the start like `CLAUDE.md`.

## Exercise

**Goal:** Try one prompt from each list (allow, ask, deny), and see which one a rule alone could not stop.

1. Open `.claude/settings.json` and `.claude/rules/git-policy.md`.
2. Start `claude` and try one prompt from each list:
   - `Run git status.` It runs.
   - `Make an empty commit with git commit --allow-empty -m test.` It asks; say no.
   - `Run git push origin HEAD.` It is refused.

## What to notice

- "Ask before you commit" in `CLAUDE.md` is a request; `git commit` on the ask list stops it every time.
- The lists hold in every mode, auto mode included: a deny blocks, an ask prompts.

## Cost

Small: three short prompts.

## Before you switch

Type `/context all` and note **Memory files**: lab 06 compares it.

## Next

Changed files you want to keep? Put them on a branch of their own first, or they come with you (the same in
PowerShell):

```bash
git switch -c run/<what-you-tried>
git add -A
git commit -m "<what you tried>"
```

Then:

```bash
git switch lab/06-skills
```
