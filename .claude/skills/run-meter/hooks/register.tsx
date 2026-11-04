// run-meter: one line above the prompt with what the work since the last `/run-meter` has used: time, the estimated
// cost, tokens (and how many came from the cache), model calls, and which subagents are running now. Counts the main
// loop and every subagent. The cost is the session's own estimate at list price, the same figure /usage shows.
import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type { Meter } from "../types";

// Change the tag when Meter's fields change: it declines what an earlier version stored, which outlives a reload.
const meter = atom({ plugin: "run-meter", key: "meter" } as const, null, { shape: "meter-1" });
const isHidden = atom({ plugin: "run-meter", key: "isHidden" } as const, false);

async function sessionUsd($: EngineInterface): Promise<number> {
  return (await $.session.usage()).cost?.usd ?? 0;
}

async function fresh($: EngineInterface): Promise<Meter> {
  const now = await $.clock.now();
  const usd = await sessionUsd($);
  return {
    startedAt: now,
    baseUsd: usd,
    usd,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    calls: 0,
    running: {},
    updatedAt: now,
  };
}

function tokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return String(count);
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

export function describe(m: Meter): string {
  const total = m.input + m.output + m.cacheRead + m.cacheWrite;
  const fromCache = total > 0 ? Math.round((m.cacheRead / total) * 100) : 0;
  const agents = Object.values(m.running);
  const now = agents.length > 0 ? agents.join(", ") : "main";
  return [
    `⏱ ${elapsed(m.updatedAt - m.startedAt)}`,
    `$${(m.usd - m.baseUsd).toFixed(2)} est.`,
    `${tokens(total)} tokens (${fromCache}% from cache)`,
    `${m.calls} model calls`,
    `now: ${now}`,
  ].join(" · ");
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "run-meter",
      description: "Start counting from zero (time, cost, tokens, calls); `/run-meter hide` or `show` toggles the band",
    });
    if ((await read($, meter)) === null) {
      const started = await fresh($);
      await update($, meter, () => started);
    }
    return next(e);
  });

  on("command.run", { command: "run-meter" }, async ($, e) => {
    const word = e.args.trim().toLowerCase();
    if (word === "hide" || word === "show") {
      await update($, isHidden, () => word === "hide");
      return { text: `Run meter ${word === "hide" ? "hidden" : "shown"}.` };
    }
    const started = await fresh($);
    await update($, meter, () => started);
    await update($, isHidden, () => false);
    return { text: "Run meter reset: counting from now." };
  });

  // Every model call, the main loop's and each subagent's: add its tokens and read the session's cost.
  on("turn.step", async function* ($, e, next) {
    const result = yield* next(e);
    const usage = result?.usage;
    if (usage) {
      const usd = await sessionUsd($);
      const now = await $.clock.now();
      await update($, meter, (m) =>
        m === null
          ? m
          : {
              ...m,
              input: m.input + usage.input_tokens,
              output: m.output + usage.output_tokens,
              cacheRead: m.cacheRead + usage.cache_read_input_tokens,
              cacheWrite: m.cacheWrite + usage.cache_creation_input_tokens,
              calls: m.calls + 1,
              usd,
              updatedAt: now,
            },
      );
    }
    return result;
  });

  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    const agentId = started.agentId;
    if (agentId) {
      await update($, meter, (m) => (m === null ? m : { ...m, running: { ...m.running, [agentId]: e.subagentType } }));
    }
    return started;
  });

  on("turn.complete", async ($, e, next) => {
    const agentId = e.agentId;
    if (agentId) {
      await update($, meter, (m) => {
        if (m === null || !(agentId in m.running)) {
          return m;
        }
        const { [agentId]: _done, ...rest } = m.running;
        return { ...m, running: rest };
      });
    }
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const m = await read($, meter);
    if (e.props.hasSurvey || m === null || (await read($, isHidden))) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    return (
      <Box>
        <Text dimColor>{describe(m)}</Text>
      </Box>
    );
  });
};
