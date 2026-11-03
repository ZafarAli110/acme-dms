# Lab 06: Skills

**Branch:** `lab/06-skills` · **Before:** `lab/05-permissions` · **Next:** `lab/07-verification`

## What this branch adds

- The steps for building a form page left `CLAUDE.md` (107 lines → 78) for a skill,
  `.claude/skills/web-form-page/SKILL.md`. Until a task needs it, only its description loads.
- Two more skills: `api-endpoint` (a backend change) and `file-uploads` (a record with its files).
- `.claude/rules/web.md`: the web rules, loaded only when Claude works on a file under `web/`.

## Try it

1. Start `claude`, type `/context all` and compare with lab 05: **Memory files** goes down, **Skills** goes up by
   three descriptions.
2. Open `.claude/skills/web-form-page/SKILL.md` and read the `description` line: it is what Claude matches a task
   against.
3. In a new session: `Plan only, change nothing: add an edit page for a customer's car.` Claude should load
   `web-form-page` (you see it in the output).
4. In a new session: `Plan only, change nothing: the parts API returns 500 when a part number ends in a space.` The
   form skill should not load.
5. Type `/` to list the skills you can start yourself.

## What to notice

- The description decides when a skill loads, so it uses a ticket's words.
- If step 3 does not load it, type `/web-form-page` yourself: a skill can be started by Claude or by you.

## Cost

Small: both prompts stop at a plan.
