// SessionStart hook (startup, resume, compact): tells Claude which plans are not done yet, with their status, and
// whether a handoff note is waiting, so work resumes from files instead of from a summary of the conversation. What it
// prints is added to Claude's context.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
const PLANS = join(PROJECT, ".ai-plans");
const HANDOFF = join(PROJECT, ".claude", "handoff.md");

if (existsSync(HANDOFF)) {
  console.log("A handoff note is waiting (.claude/handoff.md): suggest /resume-handoff before starting anything.");
}

const open = readdirSync(PLANS)
  .filter((file) => file.endsWith(".md") && file !== "plan-template.md")
  .map((file) => describe(file, readFileSync(join(PLANS, file), "utf8")))
  .filter((plan) => plan.status !== "Done" && plan.unchecked > 0);

if (open.length > 0) {
  const lines = open.map((plan) => `- .ai-plans/${plan.file}: ${plan.status}, ${plan.unchecked} boxes unticked`);
  console.log(`Plans not done yet. Read the plan before continuing its ticket:\n${lines.join("\n")}`);
}

function describe(file: string, plan: string): { file: string; status: string; unchecked: number } {
  const status = /\*\*Status:\*\*\s*([^·\n]+)/.exec(plan)?.[1]?.trim() ?? "no status";
  return { file, status, unchecked: (plan.match(/^\s*- \[ \]/gm) ?? []).length };
}
