// SessionStart hook (startup, resume, compact): tells Claude which plans still have unchecked steps, so work resumes
// from the plan file instead of from a summary of the conversation. What it prints is added to Claude's context.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const PROJECT = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
const PLANS = join(PROJECT, 'docs', 'plans');

const open = readdirSync(PLANS)
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .map((file) => ({file, unchecked: uncheckedSteps(readFileSync(join(PLANS, file), 'utf8'))}))
  .filter((plan) => plan.unchecked > 0);

if (open.length > 0) {
  const lines = open.map((plan) => `- docs/plans/${plan.file}: ${plan.unchecked} unchecked`);
  console.log(`Plans in progress. Read the plan before continuing its ticket:\n${lines.join('\n')}`);
}

function uncheckedSteps(plan: string): number {
  return (plan.match(/^\s*- \[ \]/gm) ?? []).length;
}
