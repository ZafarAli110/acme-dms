---
name: ticket
description: Takes a tracker ticket from To Do to a verified change, keeping a plan file that survives compaction, a restart or a different model. Use when asked to work on a ticket, e.g. /ticket ACME-106, or to continue one.
disable-model-invocation: true
---

# Work a ticket

The plan file `docs/plans/<KEY>.md` is the memory of this work. The conversation can be compacted, the session
restarted, or another agent can take over; the file is what carries on. Write to it as you go, not at the end.

## Start, or resume

If `docs/plans/<KEY>.md` exists, read it and continue from the first unchecked step. Do not start again.

Otherwise:

1. Read the ticket with `get_ticket`. Move it to `in-progress` with `update_ticket_status`.
2. Read the standards it touches and find the existing feature of the same kind to follow.
3. Write the plan file:

```markdown
# <KEY>: <title>

## Questions

Decisions the ticket and the standards leave open, one per line, each saying what you checked: "The ticket does not
say whether …; checked <file or ticket>. A or B?" Facts are not questions: find them in the code, the docs, the
tracker or the running system. Write "None" when nothing is open.

## Design

Only when the ticket adds or changes a screen; otherwise "No screen". One of:

- Given: <the image, screenshot or Figma link on the ticket>. Build from it; check the result against it.
- Follows: <the existing screen it copies, e.g. CustomerEdit>. That screen is the design.
- Open: prototypes in docs/prototypes/<KEY>/, waiting for a pick. → Picked: <variant>, by <who>, <date>.

## Requirements

Every requirement in the ticket, one per line, in the ticket's words, including the ones mentioned in passing. Then
the rules from docs/standards/ that apply, with the file and heading.

- [ ] R1 …

## Decisions

What was chosen and why, where the ticket or the standards left a choice. One line each.

## Shape

The existing feature this follows. The files to create or change, and the signatures (types, functions, components,
endpoints) without bodies.

## Steps

- [ ] 1. … → verify: the check that proves it (a test, or a `bun run api` call)

## Log

- <time> step 1 done: what changed, what was run, what it returned.
```

For a bug, step 1 reproduces it as a failing test; the fix comes after.

The plan is for a person to read: one line per item, no paragraphs, a link to a standard rather than a copy of it,
signatures rather than code. About 150 lines at most; if the work will not fit, it is more than one ticket: say so
and stop.

4. **The design gate.** When the ticket adds or changes a screen, decide which design line it is, in this order:
   - **Given:** the ticket carries a design (an image, a screenshot, a Figma link). Build from it, and check the
     result against it with the `browser` skill's screenshot, if this branch has it.
   - **Follows:** the change fits an existing screen (a field on a form, a list like Parts). Name that screen and copy
     its pattern; nothing to draw.
   - **Open:** a new screen, or a new part of one (a search box, a panel, a dialog), and nothing says how it looks.
     Do **not** design it on your own in the real code. Make two or three static prototypes in
     `docs/prototypes/<KEY>/` (`a.html`, `b.html`, `c.html`): plain HTML in the app's look, with the real labels and
     sample rows, nothing wired up. Each differs in one real choice (where the search goes, a dialog or a page), named
     in a comment at its top. Ask the product owner to pick, with your recommendation first, and record the pick in
     Design and Decisions. No UI code until then.
5. Show the questions and the design first, then the requirements, shape and steps. Wait for the answers, the pick
   and a go-ahead before changing code.

## Work

One step at a time: do it, run its check, tick it, and add a line to the log. When a step turns out wrong, change the
plan first, then the code. A requirement is ticked only when something checked it.

## Finish

Run the `verify` skill. Link `docs/evidence/<KEY>.md` from the plan, and tick the last step only when verification
passed.
