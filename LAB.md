# Lab 01: Project instructions (CLAUDE.md)

**Branch:** `lab/01-claude-md` · **Before:** `lab/00-start` · **Next:** `lab/02-mcp`

## What this branch adds

- `CLAUDE.md`: what the project is, the rules for every change, how to work (plan before code, verify, don't assume),
  the commands, what done means.
- `docs/standards/` and `docs/ARCHITECTURE.md`: the written standards `CLAUDE.md` points to.

## Exercise

**Goal:** Give it the same ACME-101 prompt with `CLAUDE.md` in place, and compare with lab 00's run.

1. Open `CLAUDE.md` and read "How to work". Scroll to the end: "Building a form page".
2. Start `claude` (no `--safe-mode`) and type `/context all`. Under **Memory files**, find `CLAUDE.md` and its tokens.
3. Run `bun run reset` (fresh data), then the same prompt as lab 00: `Implement this ticket:` and paste ACME-101.

## What to notice

- Nothing in the prompt asks for a plan; `CLAUDE.md` does. It should ask its questions and show a plan, then wait.
- Compare with lab 00's run: what did it check this time, and what did it leave alone?
- Which lines of `CLAUDE.md` does a backend bug fix need? All but the form section, yet it loads on every request.

## Cost

Step 3 builds a whole ticket. To keep it small, stop after the plan: the plan is the lesson.

## Next

```bash
git switch -c run/harness-101
git add -A
git commit -m "ACME-101 with the harness"
git diff run/bare-101 run/harness-101 --stat
```

Then:

```bash
git switch lab/02-mcp
```
