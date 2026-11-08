// PostToolUse hook for Edit and Write: checks a plan in .ai-plans/ against plan-template.md each time Claude changes
// it, and sends back what is wrong (exit 2), so Claude fixes the plan in the same turn. It checks what a reader relies
// on and a model gets wrong: Status is one of the template's values, Now says Done, Next and Blocked, the Log runs
// forward in time and never ahead of the clock, and nothing is built before what it needs was loaded.
import { basename } from "node:path";

interface HookInput {
  tool_input: { file_path?: string };
}

export const STATUSES = [
  "Draft",
  "Waiting on answers",
  "Waiting on a design pick",
  "In progress",
  "Verifying",
  "Done",
] as const;

/** Statuses after the go-ahead: building has started, so everything in "Load before building" must be loaded. */
const BUILDING = new Set(["In progress", "Verifying", "Done"]);

const PLAN_NAME = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_[A-Z]+-\d+_[a-z0-9-]+\.md$/;
const STAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/;
/** A Log time may run this far ahead of this machine's clock (a few minutes between two calls of `date`). */
const CLOCK_SLACK_MS = 5 * 60 * 1000;

function section(plan: string, heading: string): string {
  const start = plan.indexOf(`\n## ${heading}`);
  if (start === -1) {
    return "";
  }
  const next = plan.indexOf("\n## ", start + 4);
  return plan.slice(start, next === -1 ? undefined : next);
}

/** A field's value up to the blank line after it: a long Now wraps onto a second line. */
function field(plan: string, name: string): string | null {
  const match = new RegExp(`^\\*\\*${name}:\\*\\*\\s*([^]*?)(?:\\n\\s*\\n|(?![^]))`, "m").exec(plan);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function toTime(stamp: string): number | null {
  const match = STAMP.exec(stamp);
  return match ? new Date(`${match[1]}T${match[2]}:${match[3]}:00`).getTime() : null;
}

/** Every problem in one plan, as sentences Claude can act on; none means the plan passes. */
export function checkPlan(fileName: string, plan: string, now: number): string[] {
  const problems: string[] = [];
  if (!PLAN_NAME.test(fileName)) {
    problems.push(`The file name must be <YYYY-MM-DD>_<HH-MM>_<KEY>_<short-name>.md, not ${fileName}.`);
  }

  const status = field(plan, "Status");
  if (!status || !(STATUSES as readonly string[]).includes(status)) {
    problems.push(
      `Status must be exactly one of: ${STATUSES.join(", ")}; it is "${status ?? "missing"}". ` +
        "Anything more (what comes next, who does it) belongs in Now.",
    );
  }

  const nowLine = field(plan, "Now");
  if (!nowLine || !/^Done: [^·]+ · Next: [^·]+ · Blocked: [^·]+$/.test(nowLine)) {
    problems.push(
      'Now must be one line: "Done: <what a person can see or run> · Next: <step and what, or none> · ' +
        'Blocked: None | <what, and who answers>", each once and in that order.',
    );
  }

  const created = toTime(field(plan, "Created") ?? "");
  if (created === null) {
    problems.push("Created must be a date and time from the clock: YYYY-MM-DD HH:MM.");
  }
  let previous = created ?? 0;
  for (const line of section(plan, "Log").split("\n")) {
    if (!line.startsWith("- ")) {
      continue;
    }
    const stamp = line.slice(2, 18);
    const time = toTime(stamp);
    if (time === null) {
      problems.push(`Each Log line starts with a date and time from the clock: "${line.slice(0, 40)}…".`);
      continue;
    }
    if (time > now + CLOCK_SLACK_MS) {
      problems.push(`The Log line at ${stamp} is later than the clock: run \`date\` and use what it says.`);
    }
    if (time < previous) {
      problems.push(
        `The Log goes back in time at ${stamp}: lines are added in order, each with the time from \`date\`.`,
      );
    }
    previous = Math.max(previous, time);
  }

  if (status && BUILDING.has(status)) {
    const unloaded = section(plan, "Load before building")
      .split("\n")
      .filter((row) => row.startsWith("|") && row.includes("[ ]"));
    for (const row of unloaded) {
      const item = row.split("|")[1]?.trim() ?? row;
      problems.push(
        `Status is ${status} but ${item} is not loaded: load it before building (and tick it), ` +
          "or take the row out and say why in Decisions.",
      );
    }
  }

  if (status === "Done") {
    const open = (section(plan, "Acceptance criteria").match(/^- \[ \]/gm) ?? []).length;
    const steps = (section(plan, "Steps").match(/^- \[ \]/gm) ?? []).length;
    if (open + steps > 0) {
      problems.push(`Status is Done but ${open} acceptance box(es) and ${steps} step(s) are unticked.`);
    }
  }
  return problems;
}

if (import.meta.main) {
  const input = JSON.parse(await Bun.stdin.text()) as HookInput;
  const filePath = input.tool_input.file_path ?? "";
  const fileName = basename(filePath);
  // A ticket's plan starts with its date; other notes in the folder (a sweep's report) are not plans of the template.
  if (filePath.includes(".ai-plans/") && /^\d{4}-/.test(fileName)) {
    const problems = checkPlan(fileName, await Bun.file(filePath).text(), Date.now());
    if (problems.length > 0) {
      console.error(`${fileName} does not match plan-template.md yet:\n${problems.map((p) => `- ${p}`).join("\n")}`);
      process.exit(2);
    }
  }
}
