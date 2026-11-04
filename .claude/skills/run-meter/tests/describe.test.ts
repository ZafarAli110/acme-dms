import { expect, test } from "claude-code/testing";

import { describe as line } from "../hooks/register";

const base = {
  startedAt: 0,
  baseUsd: 1,
  usd: 5.2,
  input: 10_000,
  output: 90_000,
  cacheRead: 2_700_000,
  cacheWrite: 200_000,
  calls: 41,
  running: {},
  updatedAt: 1_084_000,
};

test("the band reads time, cost since the reset, tokens with the cache share, calls and main", async () => {
  expect(line(base)).toBe("⏱ 18m 04s · $4.20 est. · 3.0M tokens (90% from cache) · 41 model calls · now: main");
});

test("it names every running subagent", async () => {
  const running = { a1: "security-reviewer", a2: "performance-reviewer" };
  expect(line({ ...base, running })).toContain("now: security-reviewer, performance-reviewer");
});
