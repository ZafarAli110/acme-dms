---
name: qa
description: Has the qa subagent test a finished ticket in the running system, write its test cases to docs/qa/<KEY>.md and file a bug for each failure. Use when asked to QA a ticket, e.g. /qa ACME-108, after it is implemented and verified.
---

# QA a ticket

1. Make sure the system is running (`bun run status`). QA tests the running system, not the code.
2. Start the **qa** subagent with the ticket key and nothing else: no summary of the change, no hints. It tests what
   the ticket asks, in its own context.
3. When it finishes, show its summary table: each test case, PASS / FAIL / BLOCKED, and the bugs it filed.
4. A FAIL is fixed as its bug ticket says (`/ticket <bug key>`), then QA runs again until every case passes.
5. When QA is clean, run `/retro <KEY>`: what went wrong on the way is worth more than the passing test.
