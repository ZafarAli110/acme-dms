import { describe, expect, it } from "bun:test";

import { findDrift, parseSession, relativePath, summarise, summaryJson, transcriptFolderName } from "./audit-sessions";

const CWD = "/home/rita/acme-dms";

/** One transcript line: an answer from the model with the given tool calls and context size. */
function answer(id: string, at: string, context: number, calls: { name: string; input: object }[]): string {
  return JSON.stringify({
    type: "assistant",
    cwd: CWD,
    timestamp: at,
    message: {
      id,
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: context - 10,
        cache_creation_input_tokens: 0,
        output_tokens: 50,
      },
      content: calls.map((call, i) => ({ type: "tool_use", id: `${id}-${i}`, name: call.name, input: call.input })),
    },
  });
}

function prompt(text: string, at: string): string {
  return JSON.stringify({ type: "user", cwd: CWD, timestamp: at, message: { content: text } });
}

const read = (path: string) => ({ name: "Read", input: { file_path: `${CWD}/${path}` } });
const edit = (path: string) => ({ name: "Edit", input: { file_path: `${CWD}/${path}` } });

describe("audit-sessions", () => {
  it("names the transcript folder the way Claude Code does", () => {
    expect(transcriptFolderName("/Users/rita/Office/acme-dms")).toBe("-Users-rita-Office-acme-dms");
  });

  it("makes paths repository-relative, from the checkout or a worktree", () => {
    expect(relativePath(`${CWD}/web/app/root.tsx`, CWD)).toBe("web/app/root.tsx");
    expect(relativePath(`${CWD}/.claude/worktrees/acme-106/web/app/root.tsx`, CWD)).toBe("web/app/root.tsx");
    expect(relativePath("/etc/hosts", CWD)).toBeNull();
  });

  it("finds no drift when the standard was read before the first edit", () => {
    const session = parseSession(
      "s1",
      [
        prompt("/implement-ticket ACME-107", "2026-11-08T10:00:00Z"),
        answer("m1", "2026-11-08T10:01:00Z", 30_000, [read("docs/standards/web-architecture.md")]),
        answer("m2", "2026-11-08T10:03:00Z", 45_000, [edit("web/app/pages/parts/NewPart.tsx")]),
      ],
      null,
    );

    expect(findDrift(session)).toEqual([]);
  });

  it("reports the standard read after the first edit as late, and one never read as missing", () => {
    const session = parseSession(
      "s2",
      [
        prompt("add a column", "2026-11-08T10:00:00Z"),
        answer("m1", "2026-11-08T10:01:00Z", 30_000, [edit("web/app/pages/parts/PartList.tsx")]),
        answer("m2", "2026-11-08T10:02:00Z", 32_000, [read("docs/standards/web-architecture.md")]),
        answer("m3", "2026-11-08T10:03:00Z", 34_000, [edit("backend/dealership-api/src/business-logic/handlers/x.ts")]),
      ],
      null,
    );

    const drift = findDrift(session);

    expect(drift.map((d) => [d.rule, d.status, d.severity])).toEqual([
      ["web", "late", "hard"],
      ["handlers", "missing", "hard"],
    ]);
  });

  it("counts a skill, or a standard read from the shell, as loaded", () => {
    const session = parseSession(
      "s3",
      [
        prompt("new endpoint", "2026-11-08T10:00:00Z"),
        answer("m1", "2026-11-08T10:01:00Z", 30_000, [
          { name: "Skill", input: { skill: "build-api-endpoint" } },
          { name: "Bash", input: { command: "sed -n 1,80p docs/standards/multi-tenancy.md" } },
        ]),
        answer("m2", "2026-11-08T10:02:00Z", 40_000, [
          edit("backend/dealership-api/src/business-logic/handlers/x.ts"),
          edit("backend/dealership-api/src/persistence/repositories/x.ts"),
        ]),
      ],
      null,
    );

    expect(findDrift(session)).toEqual([]);
  });

  it("measures the cost: first turn, peak, the context at the first edit, and minutes to it", () => {
    const session = parseSession(
      "s4",
      [
        prompt("fix it", "2026-11-08T10:00:00Z"),
        answer("m1", "2026-11-08T10:00:30Z", 30_000, [read("README.md")]),
        // The same answer written twice, as Claude Code does: counted once.
        answer("m1", "2026-11-08T10:00:30Z", 30_000, []),
        answer("m2", "2026-11-08T10:06:00Z", 80_000, [edit("README.md")]),
        answer("m3", "2026-11-08T10:10:00Z", 60_000, []),
        JSON.stringify({ type: "system", subtype: "compact_boundary", timestamp: "2026-11-08T10:09:00Z" }),
      ],
      null,
    );

    const line = summarise(session, []);

    expect(line).toMatchObject({
      date: "2026-11-08",
      turns: 3,
      toolCalls: 2,
      compactions: 1,
      firstTurnContextTokens: 30_000,
      peakContextTokens: 80_000,
      contextAtFirstEdit: 80_000,
      toolCallsBeforeFirstEdit: 1,
      minutesToFirstEdit: 6,
      elapsedMinutes: 10,
    });
  });

  it("writes only the fixed fields to the tracked line: no prompt, path or tool name", () => {
    const session = parseSession(
      "s5",
      [
        prompt("my password is hunter2", "2026-11-08T10:00:00Z"),
        answer("m1", "2026-11-08T10:01:00Z", 30_000, [edit("web/app/secret.tsx")]),
      ],
      null,
    );

    const json = summaryJson({ ...summarise(session, findDrift(session)), extra: "leak" } as never);

    expect(Object.keys(JSON.parse(json))).toEqual([
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
    ]);
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("leak");
  });
});
