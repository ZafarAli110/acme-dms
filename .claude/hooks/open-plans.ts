// SessionStart hook (startup, resume, compact): tells Claude which plans still have unchecked steps, and whether a
// handoff note is waiting, so work resumes from files instead of from a summary of the conversation. What it prints is
// added to Claude's context.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
const PLANS = join(PROJECT, "docs", "plans");
const HANDOFF = join(PROJECT, ".claude", "handoff.md");

if (existsSync(HANDOFF)) {
  console.log("A handoff note is waiting (.claude/handoff.md): suggest /resume-handoff before starting anything.");
}

const open = readdirSync(PLANS)
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .map((file) => ({ file, unchecked: uncheckedSteps(readFileSync(join(PLANS, file), "utf8")) }))
  .filter((plan) => plan.unchecked > 0);

if (open.length > 0) {
  const lines = open.map((plan) => `- docs/plans/${plan.file}: ${plan.unchecked} unchecked`);
  console.log(`Plans in progress. Read the plan before continuing its ticket:\n${lines.join("\n")}`);
}

function uncheckedSteps(plan: string): number {
  return (plan.match(/^\s*- \[ \]/gm) ?? []).length;
}
