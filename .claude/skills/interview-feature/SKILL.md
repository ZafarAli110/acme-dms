---
name: interview-feature
description: Settles a feature's product decisions with the person before anything is built - research first, then at most two rounds of at most four questions, each with a recommended answer. From a plain request (no ticket yet) it writes the ticket; from an existing ticket it asks only its gaps. E.g. /interview-feature "let advisors log a call from the customer page", or /interview-feature ACME-107.
---

# Interview a feature: $ARGUMENTS

Work built from guesses fails late: the build follows them faithfully and the product owner sees the wrong thing at
the end. This interview puts the few decisions that are really the person's in front of them **first**, in two short
rounds, and writes down everything else as a default they can see. It never decides, and never builds. In the
workshop, the person at the keyboard plays the product owner.

## Which way in

- **A request in plain words, no ticket yet:** interview first, then **write the ticket** (step 5a). A ticket written
  before the interview is written from guesses, and everything after it follows them.
- **A ticket key** (`ACME-107`): the product owner already wrote it. Its words, acceptance criteria and checks are
  answers, not questions: interview **only its gaps**, often none (step 5b). `/implement-ticket` runs this for a
  Medium or Large ticket or a new screen.

## 0. Is it worth asking?

Find the existing feature it would follow and count the files it would change. **Small (1–3 files) and no new
screen:** say so in one line. From a ticket, go straight to its plan; from a request, write the ticket from the
request as it stands (5a) without a round of questions. Ceremony matches the size.

## 1. Research first: never ask what you can look up

The code says what exists: the screen to follow, the table that holds the data, how a similar feature handled the
same thing. The tracker says what was asked before: an existing ticket's comments, and any ticket that already covers
this request (`list_tickets`; if one does, say so and interview that ticket instead). A question the code, the ticket
or the tracker answers is a bug in the interview.

## 2. Round 1: the shape

One `AskUserQuestion`, at most four questions, each with the recommended option first, marked `(Recommended)`, and
every option saying what it means for the work. Only what nothing else depends on, and only what is still open:

- **Who it is for, and what they get** (from a request): the person and the moment, as the ticket will say it.
- **The edges:** what is in, and what is left out, where the words allow both readings.
- **A new screen, or an existing one:** when nothing shows a design and it could be either.
- **What "done" must show:** the one check that would convince them.
- **Who watches the build** (when building follows): stop and show after each step a person can see
  (human-driven), or run to the checks and report (agent-driven). Skip it when they already said ("just do it" is
  agent-driven).

## 3. Round 2: only what round 1 opened

The prototype directions, when the screen is new (two or three, each differing in one real choice: a dialog or a page,
where the search goes); the decision a "yes" in round 1 made necessary. **Then stop.** A third round needs one line
saying which answer opened a decision you could not have asked before. There is no fourth.

## 4. Leftovers are written down, not asked

When the rounds are spent, every question still open is written with your recommended answer beside it and what
changes if it is wrong: in the ticket's open points (5a) or the plan's Questions (5b). Nothing is assumed silently.

**"Defaults", "you decide", "just do it", or no answer:** take every recommendation, record each as a default with
the date, why it was recommended and what being wrong would change, and say in one line that defaults were taken. A
default is never later treated as the person's choice.

## 5a. From a request: the ticket

Draft it the way the tracker's tickets read (look at two in `list_tickets` first): a title in the product owner's
words; **Requested by** the person and their role; their need in a short quote; one sentence of what we want;
`## Acceptance criteria` (a verb and something a person sees, failure cases included); `## How we will check` (steps
a person can follow, with the demo users). The business only: **no file names, endpoints, tables or technical
notes.** Those are the plan's. Show the draft, change it until the person says it is right, then `create_ticket`
(`story`, or `bug` for something broken) and give its key. Technical answers from the interview (who watches the
build, the prototype directions) go on the ticket as a comment for the plan to pick up. Next:
`/implement-ticket <KEY>`.

## 5b. From a ticket: the plan and a comment

Write each answer into the plan as it lands (Requirement's In and Out, Design, Decisions), not at the end. Then add one
comment on the ticket (`add_comment`): the decisions made, the defaults taken and the questions left, in the ticket's
plain words. The plan is the developer's record; the ticket is the product owner's.

## What follows from the answers (the plan, and the check-plan hook, hold them)

- **A new screen with no design:** Design is `Open`, prototypes are drawn in `docs/prototypes/<KEY>/`, and the plan
  cannot go In progress until the Design line says `Picked:`. The hook refuses it.
- **A pick:** everything a person can see in the picked prototype becomes an acceptance row (a column, a badge, a
  line of help text, the empty state), so a screen that drifts from the design fails a box. Passing tests prove the
  behaviour; only these rows prove the look.
- **The size:** Scope follows the Files list (Small 1–3, Medium 4–8, Large 9+); the hook refuses a Scope that does
  not match. A ticket that comes out Large is checked for being two tickets.
