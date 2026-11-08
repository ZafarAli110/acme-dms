// `bun run audit`: what the agent's sessions in this repository did, read from the transcripts Claude Code writes
// itself (`~/.claude/projects/<this folder>/`), never from anything the agent says about its own work.
//
// Two questions:
//   Drift: did the standard (or skill) for a kind of code load BEFORE the first edit of that code? "Read at some point"
//          is nearly always yes; "read before writing" is what tells you something.
//   Cost:  how big the context was at the first turn (the harness's own cost) and at its peak, how many compactions,
//          and how long and how many tool calls before the first edit.
//
// It is a report, not a gate: a drift finding is a read MISSING from a transcript, and context can arrive without one
// (CLAUDE.md, a pasted standard). So it always exits 0 once it has run.
//
// It writes two things in `.ai-observability/`:
//   session-audit-<time>.md and session-audit-latest.md: the full report. It quotes prompts and paths, so git ignores it.
//   summary.jsonl: one line of counts per session, appended. Git keeps it: transcripts are deleted after about 30 days,
//                  and this is what is left. Its fields are fixed below (SummaryLine): ids, a date, counts, never text.
//
//   bun run audit                    the last 7 days
//   bun run audit --since 30         the last 30 days
//   bun run audit --session c0b2     one session, by the start of its id
//   bun run audit --json             the whole scan as JSON on stdout; writes nothing

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..");
const outputDir = join(root, ".ai-observability");

/** A sweep this wide over this few prompts is mechanical (a rename, a format pass): its drift is reported as soft. */
const SWEEP_FILES = 20;
const SWEEP_PROMPTS = 10;
const EDIT_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

/** A kind of code, and the standard or skill that should be loaded before it is edited (CLAUDE.md names them). */
export type Rule = {
  readonly id: string;
  readonly label: string;
  readonly paths: RegExp;
  /** Read by the Read tool, or named in a shell command (`cat`, `sed -n`): either counts as loaded. */
  readonly standards: readonly string[];
  /** Loaded by the Skill tool. */
  readonly skills: readonly string[];
};

export const RULES: readonly Rule[] = [
  {
    id: "web",
    label: "Web app code",
    paths: /^web\/app\/.*\.tsx?$/,
    standards: ["docs/standards/web-architecture.md"],
    skills: ["build-form-page", "tanstack-query", "react-router-framework-mode"],
  },
  {
    id: "handlers",
    label: "Business handlers",
    paths: /^backend\/[^/]+\/src\/(business-logic|Acme\.[A-Za-z]+\.BusinessLogic)\//,
    standards: ["docs/standards/business-handlers.md"],
    skills: ["build-api-endpoint"],
  },
  {
    id: "tenancy",
    label: "Data access (which dealer and location may see a row)",
    paths: /^backend\/[^/]+\/src\/(persistence|Acme\.[A-Za-z]+\.Persistence)\//,
    standards: ["docs/standards/multi-tenancy.md"],
    skills: [],
  },
  {
    id: "database",
    label: "Database schema and migrations",
    paths: /^backend\/[^/]+\/src\/(persistence\/(schema|migrations)|Acme\.[A-Za-z]+\.Persistence\/Migrations)\//,
    standards: ["docs/standards/database.md"],
    skills: [],
  },
  {
    id: "messaging",
    label: "Messages, the outbox and consumers",
    paths: /^backend\/.*(messaging|Messaging|outbox|consumer)/,
    standards: ["docs/standards/messaging.md"],
    skills: ["call-other-service"],
  },
  {
    id: "uploads",
    label: "File uploads",
    paths: /^(backend|web\/app)\/.*(upload|photo|Upload|Photo)/,
    standards: ["docs/standards/file-uploads.md"],
    skills: ["upload-files"],
  },
];

export type ToolCall = {
  readonly index: number;
  readonly name: string;
  /** Repository-relative, for file tools. */
  readonly path: string | null;
  readonly command: string | null;
  readonly skill: string | null;
  readonly at: string | null;
  /** The API answer that made the call: its context is the context at this call. */
  readonly turnId: string | null;
};

export type Turn = { readonly id: string; readonly contextTokens: number; readonly outputTokens: number };

export type Session = {
  readonly id: string;
  readonly agentType: string | null;
  readonly firstPrompt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly prompts: number;
  readonly calls: readonly ToolCall[];
  readonly turns: readonly Turn[];
  readonly compactions: number;
  /** Characters each tool put into the context before the first edit, by tool and path. */
  readonly resultsBeforeFirstEdit: readonly { readonly what: string; readonly chars: number }[];
};

export type Drift = {
  readonly sessionId: string;
  readonly rule: string;
  readonly status: "missing" | "late";
  readonly severity: "hard" | "soft";
  readonly firstEdit: string;
  readonly files: number;
};

/** What git keeps per session. Ids, a date, counts and null where a count cannot be known: no field can hold text. */
export type SummaryLine = {
  readonly sessionId: string;
  readonly date: string | null;
  readonly agent: boolean;
  readonly turns: number;
  readonly toolCalls: number;
  readonly subagents: number;
  readonly compactions: number;
  readonly firstTurnContextTokens: number | null;
  readonly peakContextTokens: number | null;
  readonly outputTokens: number;
  readonly toolCallsBeforeFirstEdit: number | null;
  readonly contextAtFirstEdit: number | null;
  readonly minutesToFirstEdit: number | null;
  readonly elapsedMinutes: number | null;
  readonly driftHard: number;
  readonly driftSoft: number;
};

type Entry = {
  type?: string;
  subtype?: string;
  cwd?: string;
  timestamp?: string;
  isMeta?: boolean;
  message?: {
    id?: string;
    content?:
      | string
      | {
          type?: string;
          name?: string;
          id?: string;
          tool_use_id?: string;
          input?: unknown;
          content?: unknown;
          text?: string;
        }[];
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
};

/** `/Users/me/Office/acme-dms` → `-Users-me-Office-acme-dms`: how Claude Code names a project's transcript folder. */
export function transcriptFolderName(folder: string): string {
  return folder.replace(/[^A-Za-z0-9]/g, "-");
}

/** An absolute path inside the checkout (or one of its worktrees) → repository-relative; anything else stays null. */
export function relativePath(path: string, cwd: string | null): string | null {
  const worktree = /\/\.claude\/worktrees\/[^/]+\/(.*)$/.exec(path);
  if (worktree) {
    return worktree[1] ?? null;
  }
  for (const base of [cwd, root]) {
    if (base && path.startsWith(`${base}/`)) {
      return path.slice(base.length + 1);
    }
  }
  return path.startsWith("/") ? null : path;
}

function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((block: { text?: string }) => block.text ?? "").join("\n");
  }
  return "";
}

/** One transcript file → a session. Exported for the tests, which feed it lines. */
export function parseSession(id: string, lines: readonly string[], agentType: string | null): Session {
  const calls: ToolCall[] = [];
  const turns = new Map<string, Turn>();
  const callNames = new Map<string, string>();
  const results: { what: string; chars: number }[] = [];
  let firstPrompt = "";
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let prompts = 0;
  let compactions = 0;
  let cwd: string | null = null;
  let hasEdited = false;

  for (const line of lines) {
    let entry: Entry;
    try {
      entry = JSON.parse(line) as Entry;
    } catch {
      continue;
    }
    cwd ??= entry.cwd ?? null;
    if (entry.timestamp && (entry.type === "user" || entry.type === "assistant")) {
      startedAt ??= entry.timestamp;
      endedAt = entry.timestamp;
    }
    if (entry.type === "system" && entry.subtype === "compact_boundary") {
      compactions += 1;
    }
    const content = entry.message?.content;
    if (entry.type === "user" && !entry.isMeta) {
      const isPrompt =
        typeof content === "string" || (Array.isArray(content) && content.some((b) => b.type === "text"));
      if (isPrompt) {
        prompts += 1;
        if (firstPrompt === "") {
          firstPrompt = textOf(content).replace(/\s+/g, " ").trim();
        }
      }
      if (Array.isArray(content) && !hasEdited) {
        for (const block of content) {
          if (block.type === "tool_result") {
            results.push({
              what: callNames.get(block.tool_use_id ?? "") ?? "a tool",
              chars: textOf(block.content).length,
            });
          }
        }
      }
    }
    if (entry.type !== "assistant" || !entry.message) {
      continue;
    }
    // One API answer is written as several entries with the same message id, each repeating its usage.
    const usage = entry.message.usage;
    if (usage && entry.message.id) {
      turns.set(entry.message.id, {
        id: entry.message.id,
        contextTokens:
          (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens ?? 0,
      });
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (block.type !== "tool_use" || !block.name) {
        continue;
      }
      const input = (block.input ?? {}) as {
        file_path?: string;
        notebook_path?: string;
        command?: string;
        skill?: string;
      };
      const filePath = input.file_path ?? input.notebook_path ?? null;
      const call: ToolCall = {
        index: calls.length,
        name: block.name,
        path: filePath ? relativePath(filePath, cwd) : null,
        command: typeof input.command === "string" ? input.command : null,
        skill: typeof input.skill === "string" ? input.skill : null,
        at: entry.timestamp ?? null,
        turnId: entry.message.id ?? null,
      };
      calls.push(call);
      callNames.set(block.id ?? "", call.path ? `${call.name} ${call.path}` : call.name);
      if (EDIT_TOOLS.has(call.name)) {
        hasEdited = true;
      }
    }
  }
  return {
    id,
    agentType,
    firstPrompt,
    startedAt,
    endedAt,
    prompts,
    calls,
    turns: [...turns.values()],
    compactions,
    resultsBeforeFirstEdit: results,
  };
}

/** The index of the first call that loaded one of the rule's standards or skills, or null. */
function loadedAt(rule: Rule, calls: readonly ToolCall[]): number | null {
  const hit = calls.find(
    (call) =>
      (call.name === "Read" && call.path !== null && rule.standards.includes(call.path)) ||
      (call.name === "Bash" && call.command !== null && rule.standards.some((s) => call.command?.includes(s))) ||
      (call.name === "Skill" && call.skill !== null && rule.skills.includes(call.skill)),
  );
  return hit ? hit.index : null;
}

export function findDrift(session: Session): Drift[] {
  const edits = session.calls.filter((call) => EDIT_TOOLS.has(call.name) && call.path !== null);
  const editedFiles = new Set(edits.map((call) => call.path));
  const isSweep = editedFiles.size >= SWEEP_FILES && session.prompts <= SWEEP_PROMPTS;
  const drift: Drift[] = [];
  for (const rule of RULES) {
    const matching = edits.filter((call) => rule.paths.test(call.path ?? ""));
    const first = matching[0];
    if (!first) {
      continue;
    }
    const loaded = loadedAt(rule, session.calls);
    if (loaded !== null && loaded < first.index) {
      continue;
    }
    drift.push({
      sessionId: session.id,
      rule: rule.id,
      status: loaded === null ? "missing" : "late",
      severity: isSweep ? "soft" : "hard",
      firstEdit: first.path ?? "",
      files: new Set(matching.map((call) => call.path)).size,
    });
  }
  return drift;
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) {
    return null;
  }
  return Math.round((Date.parse(to) - Date.parse(from)) / 6000) / 10;
}

export function summarise(session: Session, drift: readonly Drift[]): SummaryLine {
  const firstEdit = session.calls.find((call) => EDIT_TOOLS.has(call.name));
  const contexts = session.turns.map((turn) => turn.contextTokens);
  return {
    sessionId: session.id,
    date: session.startedAt?.slice(0, 10) ?? null,
    agent: session.agentType !== null,
    turns: session.turns.length,
    toolCalls: session.calls.length,
    subagents: session.calls.filter((call) => call.name === "Agent" || call.name === "Task").length,
    compactions: session.compactions,
    firstTurnContextTokens: contexts[0] ?? null,
    peakContextTokens: contexts.length > 0 ? Math.max(...contexts) : null,
    outputTokens: session.turns.reduce((sum, turn) => sum + turn.outputTokens, 0),
    toolCallsBeforeFirstEdit: firstEdit ? firstEdit.index : null,
    contextAtFirstEdit: session.turns.find((turn) => turn.id === firstEdit?.turnId)?.contextTokens ?? null,
    minutesToFirstEdit: firstEdit ? minutesBetween(session.startedAt, firstEdit.at) : null,
    elapsedMinutes: minutesBetween(session.startedAt, session.endedAt),
    driftHard: drift.filter((d) => d.severity === "hard").length,
    driftSoft: drift.filter((d) => d.severity === "soft").length,
  };
}

/** Exactly the SummaryLine fields, in order: whatever else an object carries never reaches the tracked file. */
export function summaryJson(line: SummaryLine): string {
  const fields: (keyof SummaryLine)[] = [
    "sessionId",
    "date",
    "agent",
    "turns",
    "toolCalls",
    "subagents",
    "compactions",
    "firstTurnContextTokens",
    "peakContextTokens",
    "outputTokens",
    "toolCallsBeforeFirstEdit",
    "contextAtFirstEdit",
    "minutesToFirstEdit",
    "elapsedMinutes",
    "driftHard",
    "driftSoft",
  ];
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field, line[field]])));
}

type Args = { sinceDays: number; session: string | null; json: boolean };

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { sinceDays: 7, session: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--since") {
      const days = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!(days > 0)) {
        throw new Error("--since takes a number of days, for example --since 30");
      }
      args.sinceDays = days;
      i += 1;
    } else if (flag === "--session") {
      args.session = argv[i + 1] ?? null;
      i += 1;
    } else if (flag === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unknown option ${flag}. Usage: bun run audit [--since <days>] [--session <id>] [--json]`);
    }
  }
  return args;
}

function loadSessions(folder: string, args: Args): Session[] {
  const since = Date.now() - args.sinceDays * 24 * 60 * 60 * 1000;
  const sessions: Session[] = [];
  for (const file of readdirSync(folder)) {
    if (!file.endsWith(".jsonl")) {
      continue;
    }
    const id = basename(file, ".jsonl");
    const path = join(folder, file);
    if ((args.session && !id.startsWith(args.session)) || (!args.session && statSync(path).mtimeMs < since)) {
      continue;
    }
    sessions.push(parseSession(id, readFileSync(path, "utf8").split("\n"), null));
    const subagents = join(folder, id, "subagents");
    if (!existsSync(subagents)) {
      continue;
    }
    for (const agentFile of readdirSync(subagents)) {
      if (!agentFile.endsWith(".jsonl")) {
        continue;
      }
      const agentId = basename(agentFile, ".jsonl");
      const metaPath = join(subagents, `${agentId}.meta.json`);
      const agentType = existsSync(metaPath)
        ? ((JSON.parse(readFileSync(metaPath, "utf8")) as { agentType?: string }).agentType ?? "unknown")
        : "unknown";
      sessions.push(
        parseSession(
          `${id}:${agentId.replace(/^agent-/, "")}`,
          readFileSync(join(subagents, agentFile), "utf8").split("\n"),
          agentType,
        ),
      );
    }
  }
  // A session opened and closed with no answer from the model has nothing to measure.
  return sessions
    .filter((session) => session.turns.length > 0)
    .toSorted((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}

function thousands(value: number | null): string {
  return value === null ? "–" : value.toLocaleString("en-GB");
}

function renderReport(
  folder: string,
  args: Args,
  sessions: readonly Session[],
  drift: readonly Drift[],
  lines: readonly SummaryLine[],
): string {
  const out: string[] = [
    `# Session audit, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
    `**Read:** \`${folder}\` · ${args.session ? `session ${args.session}` : `the last ${args.sinceDays} days`} · ` +
      `${sessions.length} transcript(s), subagents included`,
    "",
    "A drift finding is a read missing from a transcript, not proof the standard was unknown: CLAUDE.md and pasted " +
      "text arrive without one. This report quotes prompts and paths: git ignores it.",
    "",
    "## Drift: the standard or skill loaded after the first edit, or never",
    "",
  ];
  if (drift.length === 0) {
    out.push("None.", "");
  } else {
    out.push("| Session | Rule | Status | Severity | First edit | Files |", "| --- | --- | --- | --- | --- | --- |");
    for (const d of drift) {
      const rule = RULES.find((r) => r.id === d.rule);
      out.push(
        `| \`${d.sessionId.slice(0, 8)}\` | ${rule?.label ?? d.rule} | ${d.status} | ${d.severity} | \`${d.firstEdit}\` | ${d.files} |`,
      );
    }
    out.push("");
  }
  out.push(
    "## Cost",
    "",
    "Context is the tokens the model read on a turn (cached or not); the first turn is the harness's own cost.",
    "",
    "| Session | Agent | First prompt | Turns | Tool calls | First turn | Peak | Compactions | Calls before first edit | Minutes to first edit |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  sessions.forEach((session, i) => {
    const line = lines[i];
    if (!line) {
      return;
    }
    const prompt = session.firstPrompt.slice(0, 60).replaceAll("|", "\\|");
    out.push(
      `| \`${session.id.slice(0, 8)}\` | ${session.agentType ?? "main"} | ${prompt} | ${line.turns} | ${line.toolCalls} | ` +
        `${thousands(line.firstTurnContextTokens)} | ${thousands(line.peakContextTokens)} | ${line.compactions} | ` +
        `${line.toolCallsBeforeFirstEdit ?? "never edited"} | ${line.minutesToFirstEdit ?? "–"} |`,
    );
  });
  out.push(
    "",
    "## Largest tool results before the first edit",
    "",
    "Characters, not tokens (about four to a token).",
    "",
  );
  const largest = sessions
    .flatMap((session) => session.resultsBeforeFirstEdit.map((r) => ({ session: session.id.slice(0, 8), ...r })))
    .toSorted((a, b) => b.chars - a.chars)
    .slice(0, 10);
  if (largest.length === 0) {
    out.push("None.");
  }
  for (const r of largest) {
    out.push(`- \`${r.session}\` ${r.what}: ${thousands(r.chars)}`);
  }
  return `${out.join("\n")}\n`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const folder = join(homedir(), ".claude", "projects", transcriptFolderName(root));
  if (!existsSync(folder)) {
    // Say what was not measured: a zero here would read as "no drift" when nothing was read at all.
    console.log(`No transcripts for this checkout at ${folder}: nothing measured.`);
    return;
  }
  const sessions = loadSessions(folder, args);
  const drift = sessions.flatMap(findDrift);
  const lines = sessions.map((session) =>
    summarise(
      session,
      drift.filter((d) => d.sessionId === session.id),
    ),
  );
  if (args.json) {
    console.log(JSON.stringify({ folder, sessions: lines, drift }, null, 2));
    return;
  }
  mkdirSync(outputDir, { recursive: true });
  const report = renderReport(folder, args, sessions, drift, lines);
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const reportPath = join(outputDir, `session-audit-${stamp}.md`);
  writeFileSync(reportPath, report);
  writeFileSync(join(outputDir, "session-audit-latest.md"), report);
  if (lines.length > 0) {
    appendFileSync(join(outputDir, "summary.jsonl"), `${lines.map(summaryJson).join("\n")}\n`);
  }
  const hard = drift.filter((d) => d.severity === "hard").length;
  console.log(`Read ${sessions.length} transcript(s) from ${folder}: ${hard} hard drift finding(s).`);
  console.log(reportPath);
}

if (import.meta.main) {
  main();
}
