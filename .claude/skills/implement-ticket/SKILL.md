---
name: implement-ticket
description: Takes a tracker ticket from To Do to a verified change, keeping a plan file that survives compaction, a restart or a different model. Use when asked to work on a ticket, e.g. /implement-ticket ACME-106, or to continue one.
disable-model-invocation: true
---

# Work a ticket

The plan file is the memory of this work. The conversation can be compacted, the session restarted, or another agent
can take over; the file is what carries on. Write to it as you go, not at the end.

**Its name** starts with when it was created, so the folder reads in order:
`.ai-plans/<YYYY-MM-DD>_<HH-MM>_<KEY>_<short-name>.md`, e.g. `.ai-plans/2026-11-04_15-30_ACME-107_new-part-page.md`.
Find a ticket's plan by its key: `.ai-plans/*_<KEY>_*.md`. Take every date and time, in the name, Created and the Log,
from the clock (`date '+%Y-%m-%d %H:%M'`; PowerShell: `Get-Date -Format 'yyyy-MM-dd HH:mm'`), never from memory: a model does not know what time it is.

## Start, or resume

If the ticket's plan exists, read it and continue from **Now** and the first unchecked step. Do not start again.

Otherwise:

1. Read the ticket with `get_ticket`. Move it to `in-progress` with `update_ticket_status`.
2. Read the standards it touches and find the existing feature of the same kind to follow.
3. **Copy `.ai-plans/plan-template.md`** to the plan's name and fill it in, keeping its sections and their order:
   every plan looks the same. For a bug, step 1 reproduces it as a failing test; the fix comes after. About 200 lines
   is a soft limit: past it, check whether this is really two tickets, and say so if it is.
4. **The design gate.** When the ticket adds or changes a screen, decide which design it is, in this order:
   - **Given:** the ticket carries a design (an image, a screenshot, a Figma link). Build from it, and check the
     result against it with the `check-in-browser` skill's screenshot, if this branch has it.
   - **Follows:** the change fits an existing screen (a field on a form, a list like Parts). Name that screen and copy
     its pattern; nothing to draw.
   - **Open:** a new screen, or a new part of one (a search box, a panel, a dialog), and nothing says how it looks.
     Do **not** design it on your own in the real code. Make two or three static prototypes in
     `docs/prototypes/<KEY>/` (`a.html`, `b.html`, `c.html`): plain HTML in the app's look, with the real labels and
     sample rows, nothing wired up. Each differs in one real choice (where the search goes, a dialog or a page), named
     in a comment at its top. Ask the product owner to pick, with your recommendation first, and record the pick in
     the Design field and Decisions. No UI code until then.
5. **Check it before you show it:**
   - every section of the template is there, in its order, or says "N/A: <reason>";
   - every file in Files exists, or is marked **new**; the high-level code shows the logic that matters (a query, the
     order of steps), and every name in it was found in the code or is marked new: no invented helpers;
   - every acceptance row has a verb and something a person can see, and there is at least one failure row;
   - Scope matches the number of files; Status and Now are true.
6. **One architect round, always.** Dispatch the **architect** subagent with the ticket key and the plan's path, and
   nothing else: it has not seen this conversation. Fix the plan for every finding it reports, move any product
   decision it found into Questions, and add one line to the Log: its verdict and what changed. One round only; it is
   not sent the plan again.
7. Show the plan as a person reads it: Status and Now, the requirement and the acceptance criteria, then what you need
   from them (the questions, the design pick). Wait for the answers, the pick and a go-ahead before changing code;
   then set Status to "In progress".

## Work

One step at a time: do it, run its check, tick it, and add a line to the log. When a step turns out wrong, change the
plan first, then the code. An acceptance box is ticked only when something checked it. Update **Now** as you go.

**Look at what you built.** After a step that changes a screen, open it with the `check-in-browser` skill before you
tick the step: screenshots at 1440 and 1024 wide, read each one, and say what you see. Fix anything overlapping,
spilling out or cut off in that step, not at the end. Tests prove behaviour; only looking shows the layout.

## Finish

Run the `verify-ticket` skill. Link `docs/evidence/<KEY>.md` from the plan, tick the last step only when verification
passed, and set Status to "Done".

**Whenever you stop**, finished or not, Status and Now say what is true at that moment: what a person can see or run,
what comes next and who does it, and anything left undone with its reason. A reader must never have to guess whether
something was skipped on purpose or the run broke off.
