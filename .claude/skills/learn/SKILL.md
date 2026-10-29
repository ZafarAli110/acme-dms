---
name: learn
description: Turns proven lessons in docs/lessons/ into a skill, so the next ticket of the same kind gets them right the first time. Use when asked to learn from finished tickets, e.g. /learn, after /retro.
---

# Learn: from lessons to a skill

1. Read every `docs/lessons/*.md`. Leave out everything under `## Unproven`.
2. Group the lessons by their "Applies when". A group is worth a skill when it applies beyond the ticket it came from
   (another list will be exported; another endpoint will stream). A one-off stays a lesson.
3. Look in `.claude/skills/` first. If a skill already covers that kind of work, **update it**; do not add a near
   duplicate.
4. Draft the skill and show it before writing it:
   - `description`: when to use it, from the "Applies when" lines, so it loads for the next ticket of that kind.
   - The steps, in the order the work happens, each one citing its lesson (`docs/lessons/ACME-108.md#L2`).
   - **How to check**: the commands from the lessons' evidence, with the result that means it is right.
5. Writing to `.claude/skills/` asks the person first (a permission rule): they decide what the team's agents learn.
6. Then prove it. A skill is believed only once a fresh session, given a similar ticket and nothing else, gets those
   steps right first time and passes `/qa`. Suggest which ticket.
