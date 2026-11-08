import { describe, expect, it } from "bun:test";

import { checkPlan } from "./check-plan";

const NAME = "2026-11-08_10-00_ACME-110_customer-list-indexes.md";
const NOW = new Date("2026-11-08T12:00:00").getTime();

/** A plan that passes; each test breaks one thing. */
function plan(changes: { status?: string; now?: string; load?: string; log?: string; steps?: string } = {}): string {
  return [
    "# ACME-110: The customer list stays quick at our biggest location",
    "",
    "**Created:** 2026-11-08 10:00",
    "",
    `**Status:** ${changes.status ?? "In progress"}`,
    "",
    `**Now:** ${changes.now ?? "Done: the plan, answered · Next: step 2, the index · Blocked: None"}`,
    "",
    "## Acceptance criteria: the goal",
    "",
    "- [x] Open Customers at Northside → the first page shows in under a second",
    "",
    "## Load before building",
    "",
    "| Item | Kind | Why | Loaded? |",
    "| --- | --- | --- | --- |",
    `| \`docs/standards/database.md\` "Indexes" | Standard | the index | ${changes.load ?? "[x]"} |`,
    "",
    "## Steps",
    "",
    changes.steps ?? "- [x] 1. The failing test → verify: it fails",
    "",
    "## Log",
    "",
    changes.log ?? "- 2026-11-08 10:00 Plan written.\n- 2026-11-08 10:20 Step 1: the test fails, as it should.",
    "",
  ].join("\n");
}

describe("check-plan", () => {
  it("passes a plan that follows the template", () => {
    expect(checkPlan(NAME, plan(), NOW)).toEqual([]);
  });

  it("reads a Now line that wraps onto a second line", () => {
    expect(checkPlan(NAME, plan({ now: "Done: the plan ·\nNext: step 2 · Blocked: None" }), NOW)).toEqual([]);
  });

  it("refuses a Status that is not one of the template's, even with a note after it", () => {
    const problems = checkPlan(NAME, plan({ status: "Done (verified; pull request and QA to follow)" }), NOW);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Status must be exactly one of");
  });

  it("refuses a Now line without Done, Next and Blocked, each once", () => {
    const problems = checkPlan(NAME, plan({ now: "Done: the plan · Done: step 1 · Next: step 2" }), NOW);
    expect(problems[0]).toContain("Now must be one line");
  });

  it("refuses a Log that goes back in time, or runs ahead of the clock", () => {
    const backwards = "- 2026-11-08 10:05 Architect round.\n- 2026-11-08 10:02 Question answered.";
    expect(checkPlan(NAME, plan({ log: backwards }), NOW)[0]).toContain("goes back in time at 2026-11-08 10:02");
    expect(checkPlan(NAME, plan({ log: "- 2026-11-08 13:00 Done." }), NOW)[0]).toContain("later than the clock");
  });

  it("refuses a Log line before the plan was created, or with no time", () => {
    expect(checkPlan(NAME, plan({ log: "- 2026-11-08 09:00 Early." }), NOW)[0]).toContain("goes back in time");
    expect(checkPlan(NAME, plan({ log: "- Plan written." }), NOW)[0]).toContain("starts with a date and time");
  });

  it("refuses building before what the plan needs is loaded, but not while it is still a draft", () => {
    const problems = checkPlan(NAME, plan({ load: "[ ] not loaded: followed the next handler" }), NOW);
    expect(problems[0]).toContain("is not loaded");
    expect(checkPlan(NAME, plan({ status: "Draft", load: "[ ]" }), NOW)).toEqual([]);
  });

  it("refuses Done with a step still unticked", () => {
    const problems = checkPlan(NAME, plan({ status: "Done", steps: "- [ ] 1. The failing test" }), NOW);
    expect(problems[0]).toContain("1 step(s) are unticked");
  });

  it("refuses a file name that is not date, time, key and name", () => {
    expect(checkPlan("ACME-110-plan.md", plan(), NOW)[0]).toContain("The file name must be");
  });
});
