// Docs that no longer match the repository: a command the README does not list, a path a doc names that is gone, a
// link that leads nowhere, a skill or subagent HARNESS.md does not list. Each of these drifted here at least once.
// It reads committed files only, and runs in `bun run gate:fast`.
//
//   bun run docs:check

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");

/** Files the harness writes while it works: a doc may name them before they exist. */
const WRITTEN_WHILE_WORKING = [".claude/handoff.md", "docs/lessons/", "docs/evidence/", "docs/qa/", ".ai-plans/"];

/** Folders a doc path can start with: anything else in backticks is not a repository path. */
const PATH = /`((?:\.claude|\.github|\.githooks|apphost|backend|contracts|docs|scripts|web)\/[^`\s]+)`/g;

/** A placeholder, a glob or an example, not a real path: `docs/lessons/<KEY>.md`, `web/**`. */
const PLACEHOLDER = /[<>*{}…$]|\.\.\./;

const LINK = /\]\((?!https?:|#|mailto:)([^)\s#]+)/g;

const findings: string[] = [];

function trackedFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files"], { cwd: root });
  return result.stdout.toString().split("\n").filter(Boolean);
}

function isWrittenWhileWorking(path: string): boolean {
  return WRITTEN_WHILE_WORKING.some((prefix) => path === prefix || path.startsWith(prefix));
}

function checkScriptsAreDocumented(): void {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const name of Object.keys(manifest.scripts)) {
    if (!readme.includes(`bun run ${name}`)) {
      findings.push(`README.md: \`bun run ${name}\` is a script in package.json, but the README does not list it`);
    }
  }
}

function checkPathsAndLinks(docs: string[]): void {
  for (const doc of docs) {
    const lines = readFileSync(join(root, doc), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(PATH)) {
        // `file.ts:42`, `file.md#L2` and a trailing full stop name the same file.
        const path = (match[1] ?? "")
          .replace(/#.*$/, "")
          .replace(/:\d+(-\d+)?$/, "")
          .replace(/[.,;:)]+$/, "");
        if (PLACEHOLDER.test(path) || isWrittenWhileWorking(path)) {
          continue;
        }
        if (!existsSync(join(root, path))) {
          findings.push(`${doc}:${index + 1}: \`${path}\` does not exist`);
        }
      }
      for (const match of line.matchAll(LINK)) {
        const target = match[1] ?? "";
        if (!existsSync(join(root, dirname(doc), target))) {
          findings.push(`${doc}:${index + 1}: the link to ${target} leads nowhere`);
        }
      }
    });
  }
}

function checkHarnessListsEverything(files: string[]): void {
  const harnessPath = join(root, "docs", "HARNESS.md");
  if (!existsSync(harnessPath)) {
    return;
  }
  const harness = readFileSync(harnessPath, "utf8");
  for (const file of files) {
    const skill = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/.exec(file)?.[1];
    const agent = /^\.claude\/agents\/([^/]+)\.md$/.exec(file)?.[1];
    const name = skill ?? agent;
    if (name && !harness.includes(`\`${name}`) && !harness.includes(`\`/${name}`)) {
      findings.push(`docs/HARNESS.md: ${file} is not listed`);
    }
  }
}

const files = trackedFiles();
const docs = files.filter((file) => file.endsWith(".md") && !isWrittenWhileWorking(file));
checkScriptsAreDocumented();
checkPathsAndLinks(docs);
checkHarnessListsEverything(files);

if (findings.length > 0) {
  console.error(`docs:check: ${findings.length} place(s) where the docs no longer match the repository:`);
  for (const finding of findings) {
    console.error(`  ${finding}`);
  }
  process.exit(1);
}
console.log(`docs:check: ${docs.length} docs match the repository`);
