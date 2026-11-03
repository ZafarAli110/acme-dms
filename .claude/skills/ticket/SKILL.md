---
name: ticket
description: Takes a tracker ticket from To Do to a verified change, keeping a plan file that survives compaction, a restart or a different model. Use when asked to work on a ticket, e.g. /ticket ACME-106, or to continue one.
disable-model-invocation: true
---

# Work a ticket

The plan file is the memory of this work. The conversation can be compacted, the session restarted, or another agent
can take over; the file is what carries on. Write to it as you go, not at the end.

**Its name** starts with when it was created, so the folder reads in order:
`docs/plans/<YYYY-MM-DD>_<HH-MM>_<KEY>_<short-name>.md`, e.g. `docs/plans/2026-11-04_15-30_ACME-107_new-part-page.md`.
Find a ticket's plan by its key: `docs/plans/*_<KEY>_*.md`.

## Start, or resume

If the ticket's plan exists, read it and continue from **Now** and the first unchecked step. Do not start again.

Otherwise:

1. Read the ticket with `get_ticket`. Move it to `in-progress` with `update_ticket_status`.
2. Read the standards it touches and find the existing feature of the same kind to follow.
3. Write the plan, in this order: what a reader needs first comes first.

````markdown
# <KEY>: <title>

**Created:** <YYYY-MM-DD HH:MM> · **Status:** <Waiting on answers | Waiting on a design pick | Ready to build |
In progress | Verifying | Done> · **Ticket:** <KEY> · **Branch:** <branch> · **Design:** <No screen | Given | Follows
<screen> | Open: prototypes in docs/prototypes/<KEY>/>

**Now:** Done <what a person can already see> · Next: <step number and what> · Blocked: <None | the questions below,
who answers>

## Requirement

<The need in one or two sentences, in the ticket's words: who does what, and what they get.>

- **In:** <what this delivers, one line>
- **Out:** <what the ticket leaves out, one line>

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log. One line each: a verb and what is seen.

Happy

- [ ] <do X> → <see Y>

Failure: invalid input, absent data, not allowed, a service down

- [ ] <do X wrong> → <it refuses, and what the user sees>

## Load before building

- [ ] Skills: <the skills for the files this touches, e.g. web-form-page, file-uploads>
- [ ] Standards: <docs/standards/ file and heading, one per line>

## Shape

**Follows:** <the existing feature this copies> · **Deviates:** <none | one line>

Files (new, changed, deleted):

1. `path/to/file.ts` — <what changes>

High-level code (signatures and shapes only, no bodies; every name checked to exist or marked new):

```ts
executeAsync(userContext: UserContext, request: PartCreateRequestDto, files: PartPhotoUploadRequestDto[]): Promise<PartResponseDto>;
```

## Tests

- Handler (real Postgres): <what each test proves, including the rows that must not come back>
- End to end (Playwright): <the user-visible behaviour>

## Steps

- [ ] 1. <what> → verify: <the check that proves it>

## Questions

Open decisions the ticket and the standards leave, each saying what you checked and your recommendation first:
"<question>; checked <where>. A (recommended): … B: …". Facts are not questions: find them.
"None" when nothing is open.

## Decisions

- D1 <what was chosen, over what, why: one line>

## Log

- <YYYY-MM-DD HH:MM> <what happened, what was run, what it returned>
````

For a bug, step 1 reproduces it as a failing test; the fix comes after.

The plan is for a person to read: one line per item, no paragraphs, a link to a standard rather than a copy of it,
signatures rather than code. About 150 lines at most; if the work will not fit, it is more than one ticket: say so
and stop. Keep **Status** and **Now** true at every step: they are what a person reads first.

4. **The design gate.** When the ticket adds or changes a screen, decide which design it is, in this order:
   - **Given:** the ticket carries a design (an image, a screenshot, a Figma link). Build from it, and check the
     result against it with the `browser` skill's screenshot, if this branch has it.
   - **Follows:** the change fits an existing screen (a field on a form, a list like Parts). Name that screen and copy
     its pattern; nothing to draw.
   - **Open:** a new screen, or a new part of one (a search box, a panel, a dialog), and nothing says how it looks.
     Do **not** design it on your own in the real code. Make two or three static prototypes in
     `docs/prototypes/<KEY>/` (`a.html`, `b.html`, `c.html`): plain HTML in the app's look, with the real labels and
     sample rows, nothing wired up. Each differs in one real choice (where the search goes, a dialog or a page), named
     in a comment at its top. Ask the product owner to pick, with your recommendation first, and record the pick in
     the Design field and Decisions. No UI code until then.
5. Show the plan as a person reads it: Status and Now, the requirement and the acceptance criteria, then what you need
   from them (the questions, the design pick). Wait for the answers, the pick and a go-ahead before changing code;
   then set Status to "In progress".

## Work

One step at a time: do it, run its check, tick it, and add a line to the log. When a step turns out wrong, change the
plan first, then the code. An acceptance box is ticked only when something checked it. Update **Now** as you go.

## Finish

Run the `verify` skill. Link `docs/evidence/<KEY>.md` from the plan, tick the last step only when verification passed,
and set Status to "Done".
