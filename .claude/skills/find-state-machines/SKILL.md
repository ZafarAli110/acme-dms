---
name: find-state-machines
description: Sweeps the whole repository, not a diff, for state machines nobody declared - in every service and the web app - checks each against the state reviewer's questions, and writes what it finds to docs/plans/implicit-state-machines.md. It changes no code. Started by a person, e.g. /find-state-machines, or /find-state-machines web for one area.
disable-model-invocation: true
argument-hint: "[area: web | dealership-api | document-api | identity | gateway, or nothing for all]"
---

# Find the state machines nobody declared: $ARGUMENTS

The **state-reviewer** finds the machines a diff touches. This finds the ones no change has touched yet. Run it after a
large feature, before a release, or when a bug turns out to be a stage nobody named. It reads; it never changes code.

Read `.claude/agents/state-reviewer.md` first: its sections 1 to 7 are the questions, and its report format is the
format of each finding here. Then read `docs/plans/implicit-state-machines.md`, if it exists: what was found before, and
what has been fixed since.

## 1. One search per area, at once

Start one read-only subagent per area in one message, so they run side by side; with an argument, only that area.

| Area                 | Where                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| web                  | `web/app/` (kernels, storage, hooks, forms, dialogs, polling), `web/e2e/` for what is tested                       |
| dealership-api       | `backend/dealership-api/src/` (status columns, consumers, the inbox, exports, uploads, ETags)                      |
| document-api         | `backend/document-api/` (document status, the outbox, the processing consumer)                                     |
| identity and gateway | `backend/identity-api/`, `backend/gateway-api/` (refresh chain, sessions, leases, signing keys, throttle, seeding) |

Give each: the area's folders; "read `.claude/agents/state-reviewer.md` and apply sections 1 to 7 to every state machine
in this area, not to a diff"; "a machine that crosses into another area (a message, a call, a shared table): follow it
there and say so"; "every finding with `file:line`, `— checked` or `— inferred`, and the scenario that breaks it";
"the table of unfinished states, with the way out, the owner and what happens if it never comes"; and "read only:
change nothing, run no servers".

## 2. Check before you write

For each `blocking` finding, open the file and line it cites and read what the code does. A finding the code plainly
contradicts is dropped, and recorded in `docs/lessons/reviewers.md` under "Wrong" for the state reviewer. A machine
found by two searches is written once, under the area that owns its writes.

## 3. Write it down

Bring `docs/plans/implicit-state-machines.md` up to date, keeping its shape: every finding worst first with an id and
whether it was checked; the unfinished states with no sure way out; the plans that fix them; the order of work. A
finding already there keeps its id; a fixed one is moved to "Fixed" with its commit. A new family of machines gets a
plan of its own next to it in `docs/plans/`.

## 4. Report

In the chat: how many machines, how many blocking and should-fix findings, the three worst, the unfinished states with
no way out, and what changed since the last sweep. The fixes go through `/implement-ticket` or a person's plan; this
skill never starts them.
