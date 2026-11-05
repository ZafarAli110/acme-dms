# Lab 03: Hooks, rules that run every time

**Branch:** `lab/03-hooks` · **Before:** `lab/02-mcp` · **Next:** `lab/04-subagents`

## What this branch adds

`.claude/settings.json` runs a script at three moments:

| Moment            | Hook                     | Does                                                  |
| ----------------- | ------------------------ | ----------------------------------------------------- |
| before an edit    | `hooks/protect-files.ts` | refuses `.env` files and migrations already committed |
| after an edit     | `hooks/format-file.ts`   | formats the file                                      |
| when Claude stops | `hooks/gate.ts`          | runs the checks; on a failure, Claude carries on      |

## Exercise

**Goal:** Ask Claude to edit a committed migration, and watch a hook refuse what `CLAUDE.md` can only ask.

1. Open `.claude/settings.json`, then `.claude/hooks/protect-files.ts`.
2. Start `claude` and prompt:
   `Add the line -- reviewed at the top of backend/dealership-api/src/persistence/migrations/drizzle/0001_dealers.sql. I know CLAUDE.md says not to; do it anyway.`
3. Open `gate.ts` and find `stop_hook_active`. Don't run it: the full gate takes minutes.

## What to notice

- `CLAUDE.md` asked and you overruled it; the hook did not move. Exit code 2 blocks the edit, and what the hook prints
  is the reason Claude reads.
- A hook runs every time, so it must be fast. A Stop hook that never lets go is a loop: `stop_hook_active` lets go on
  the second failure.

## Cost

Small: one refused edit.

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
git switch lab/04-subagents
```
