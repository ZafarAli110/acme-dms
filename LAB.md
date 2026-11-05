# Lab 02: Custom tools with MCP

**Branch:** `lab/02-mcp` · **Before:** `lab/01-claude-md` · **Next:** `lab/03-hooks`

## What this branch adds

`.mcp.json` connects the Acme Tracker (the team's board) for everyone who clones the repo. Claude can read tickets,
move them and comment, instead of you pasting them.

## Exercise

**Goal:** Let Claude read ACME-104 from the board itself, then see what its tools cost in context.

1. Start the tracker: in `acme-tracker`, `bun start`; the board is at http://localhost:4100.
2. Start `claude` here and approve `acme-tracker` when it asks. Type `/mcp`: the tracker's tools are listed.
3. Prompt: `Read ACME-104 and give me its rules in three lines. Change nothing.`
4. Type `/context`: the tools take room before any work starts.

## What to notice

- It calls `get_ticket` itself. A tool is part of the harness: what no tool can do, the agent cannot do.
- MCP tools are not free: their descriptions sit in the context of every session.

## Cost

Small: one ticket read, no code changed.

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
git switch lab/03-hooks
```
