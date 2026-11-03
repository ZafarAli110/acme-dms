<!--
The plan template. `/ticket <KEY>` copies it to .ai-plans/<YYYY-MM-DD>_<HH-MM>_<KEY>_<short-name>.md, for example
.ai-plans/2026-11-04_15-30_ACME-107_new-part-page.md, and fills it in. Every plan has this shape, in this order: what a
reader needs first comes first. About 200 lines, a soft limit: longer means check whether it is two tickets. Delete this
comment and every <placeholder> line that does not apply ("N/A: <reason>" when a whole section does not).
-->

# <KEY>: <title>

**Created:** <YYYY-MM-DD HH:MM>

**Status:** Draft | Waiting on answers | Waiting on a design pick | In progress | Verifying | Done

**Ticket:** <KEY> · **Branch:** <branch>

**Scope:** Small (1-3 files) | Medium (4-8) | Large (9+) · **Layers:** Backend | Web | Both

**Design:** No screen | Given: <the image or link on the ticket> | Follows: <existing screen> | Open: prototypes in
`docs/prototypes/<KEY>/` → Picked: <variant>, by <who>, <date>

**Now:** Done: <what a person can already see or run> · Next: <step number and what> · Blocked: None | <what, and who
answers>

## Requirement

<The need in one or two sentences, in the ticket's words: who does what, and what they get.>

- **In:** <what this delivers, one line>
- **Out:** <what the ticket leaves out, one line>

## Acceptance criteria: the goal

Done means every box is ticked, each by a check whose result is in the Log. One line each: a verb, then what is seen.

Happy

- [ ] <do X> → <see Y>

Failure: invalid input, absent data, not allowed, another service down

- [ ] <do X wrong> → <it refuses, and what the user sees; nothing half saved>

## Load before building

| Item                                   | Kind     | Why                          | Loaded? |
| -------------------------------------- | -------- | ---------------------------- | ------- |
| `<skill name>`                         | Skill    | <the files it covers>        | [ ]     |
| `docs/standards/<file>.md` "<heading>" | Standard | <the rule this change meets> | [ ]     |

## Shape

**Follows:** <the existing feature this copies> · **Deviates:** None | <one line>

Files (each checked to exist, or marked **new**):

1. `path/to/file.ts`: <what changes>
2. `path/to/new-file.ts` (**new**): <what it is>

High-level code: signatures and shapes only, no bodies; every name checked to exist or marked new.

```ts
// path/to/file.ts
export function name(input: Input): Promise<Output>;
```

**Impact:** Breaking changes: None | <who calls this and what changes for them> · Depends on: <a service, a migration,
a ticket> · Performance: <the sizes this runs at, and what keeps it fast>

## Tests

Written with the code they cover, failing first.

| Kind                    | File                      | Proves                                       |
| ----------------------- | ------------------------- | -------------------------------------------- |
| Handler (real Postgres) | `<handler>/__test__/….ts` | <including the rows that must not come back> |
| End to end (Playwright) | `web/e2e/<area>.spec.ts`  | <the user-visible behaviour>                 |

## Steps

- [ ] 1. <what> → verify: <the check that proves it>

## Questions

<"None" when nothing is open.> Each one says what was checked, then the options, recommendation first:

1. <question>; checked <where>. **A (recommended):** <…> **B:** <…>

## Decisions

Only the ones a reviewer or the product owner could disagree with: a choice between real options that changes what
users see, the data, an API or the design. A choice the standards or the pattern in Follows already make is not a
decision; leave it out. Usually a handful; "None" is fine.

- D1 <what was chosen, over what, and why: one line>

## Log

- <YYYY-MM-DD HH:MM> <what happened, what was run, what it returned; an acceptance box's evidence goes here>
