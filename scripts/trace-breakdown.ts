// Where requests spent their time, from the traces the dashboard holds: the gateway's session read, the hop to
// dealership-api, the API's own code, waiting for a database connection, and the SQL itself; for a typical request and
// for the slowest 5%, second by second, with the slow statements by text. The question a load test's p95 leaves open:
// slow because of one query, or because everything waited at once?
//
//   bun run trace-breakdown                         the last 60 seconds
//   bun run trace-breakdown --seconds 300           the last 5 minutes
//   bun run trace-breakdown --since 2026-11-09T17:32:37Z --until 2026-11-09T17:33:16Z
//
// Run it straight after `bun run load-test` (its rush is what to read: leave out the warm-up with --since). Under
// `start:prod --load-test` one request in ten is traced, which is plenty for shares and percentiles. Wall-clock time,
// not CPU: under load everything waits, so read it for where requests queue, and size machines from the load test's CPU
// columns. Read-only.
const USAGE = "Usage: bun run trace-breakdown [--seconds N | --since <ISO time> [--until <ISO time>]]";

/** A span as `aspire otel spans --format Json` gives it. */
export interface TraceSpan {
  traceId: string;
  kind: string;
  name: string;
  source: string;
  destination?: string;
  durationMs: number;
  timestamp: string;
  attributes?: Record<string, string>;
}

/** One request through the gateway, its time split by where it went. */
export interface RequestTime {
  at: number;
  route: string;
  total: number;
  sessionRead: number;
  gatewayOther: number;
  hop: number;
  apiCode: number;
  connectionWait: number;
  sql: number;
  slowestStatement: number;
  statements: number;
}

const GATEWAY = "gateway-api";
const API = "dealership-api";
/** node-postgres's spans for taking a connection: waiting, not a query. */
const CONNECTION_WAIT = /^pg(-pool)?\.connect$/;

function isDatabaseSpan(span: TraceSpan): boolean {
  return Object.keys(span.attributes ?? {}).some((key) => key.startsWith("db."));
}

/** Each traced request to dealership-api through the gateway, between `from` and `to` (milliseconds since the epoch). */
export function requestTimes(spans: TraceSpan[], from: number, to: number): RequestTime[] {
  const byTrace = new Map<string, TraceSpan[]>();
  for (const span of spans) {
    const at = Date.parse(span.timestamp);
    if (at < from || at > to) {
      continue;
    }
    const list = byTrace.get(span.traceId) ?? [];
    list.push(span);
    byTrace.set(span.traceId, list);
  }
  const times: RequestTime[] = [];
  for (const list of byTrace.values()) {
    const gateway = list.find((span) => span.source === GATEWAY && span.kind === "Server");
    const call = list.find(
      (span) => span.source === GATEWAY && span.kind === "Client" && (span.destination ?? "").startsWith(API),
    );
    const api = list.find((span) => span.source.startsWith(API) && span.kind === "Server");
    if (!gateway || !call || !api) {
      continue;
    }
    const sessionRead = list
      .filter((span) => span.source === GATEWAY && isDatabaseSpan(span))
      .reduce((sum, span) => sum + span.durationMs, 0);
    const apiDatabase = list.filter((span) => span.source.startsWith(API) && isDatabaseSpan(span));
    const waits = apiDatabase.filter((span) => CONNECTION_WAIT.test(span.name));
    const statements = apiDatabase.filter((span) => !CONNECTION_WAIT.test(span.name));
    const connectionWait = waits.reduce((sum, span) => sum + span.durationMs, 0);
    const sql = statements.reduce((sum, span) => sum + span.durationMs, 0);
    times.push({
      at: Date.parse(gateway.timestamp),
      route: api.attributes?.["http.route"] ?? api.name,
      total: gateway.durationMs,
      sessionRead,
      gatewayOther: Math.max(0, gateway.durationMs - call.durationMs - sessionRead),
      hop: Math.max(0, call.durationMs - api.durationMs),
      apiCode: Math.max(0, api.durationMs - sql - connectionWait),
      connectionWait,
      sql,
      slowestStatement: Math.max(0, ...statements.map((span) => span.durationMs)),
      statements: statements.length,
    });
  }
  return times.toSorted((a, b) => a.total - b.total);
}

/** The time at a fraction of the sorted list (0.95 for p95). */
export function percentile(sortedTotals: number[], fraction: number): number {
  if (sortedTotals.length === 0) {
    return 0;
  }
  return sortedTotals[Math.min(sortedTotals.length - 1, Math.floor(sortedTotals.length * fraction))] ?? 0;
}

function average(times: RequestTime[], pick: (time: RequestTime) => number): string {
  if (times.length === 0) {
    return "-";
  }
  return (times.reduce((sum, time) => sum + pick(time), 0) / times.length).toFixed(1);
}

/** The report: typical against slowest 5%, the slowest routes, second by second, the slow spans by text. */
export function report(spans: TraceSpan[], from: number, to: number): string {
  const times = requestTimes(spans, from, to);
  if (times.length === 0) {
    return "No traced requests to dealership-api in that window. Run a load test (or use the app) first.";
  }
  const totals = times.map((time) => time.total);
  const p50 = percentile(totals, 0.5);
  const p95 = percentile(totals, 0.95);
  const typical = times.filter((time) => time.total <= p50);
  const slowest = times.filter((time) => time.total >= p95);
  const lines = [
    `${times.length} traced requests: p50 ${p50} ms, p95 ${p95} ms, p99 ${percentile(totals, 0.99)} ms`,
    "",
    `| Where the time went (average)     | typical (≤ p50) | slowest 5% |`,
    `| --------------------------------- | --------------- | ---------- |`,
  ];
  const rows: [string, (time: RequestTime) => number][] = [
    ["whole request, at the gateway", (time) => time.total],
    ["gateway: reading the session", (time) => time.sessionRead],
    ["gateway: everything else", (time) => time.gatewayOther],
    ["gateway to dealership-api (queue)", (time) => time.hop],
    ["dealership-api's own code", (time) => time.apiCode],
    ["waiting for a database connection", (time) => time.connectionWait],
    ["SQL statements, together", (time) => time.sql],
    ["the slowest statement", (time) => time.slowestStatement],
  ];
  for (const [label, pick] of rows) {
    lines.push(
      `| ${label.padEnd(33)} | ${`${average(typical, pick)} ms`.padStart(15)} | ${`${average(slowest, pick)} ms`.padStart(10)} |`,
    );
  }
  lines.push(
    `| statements a request              | ${average(typical, (time) => time.statements).padStart(15)} | ${average(slowest, (time) => time.statements).padStart(10)} |`,
  );

  const routes = new Map<string, number>();
  for (const time of slowest) {
    routes.set(time.route, (routes.get(time.route) ?? 0) + 1);
  }
  lines.push("", "The slowest 5%, by route:");
  for (const [route, count] of [...routes].toSorted((a, b) => b[1] - a[1]).slice(0, 8)) {
    lines.push(`  ${String(count).padStart(5)}  ${route}`);
  }

  lines.push(
    "",
    "Second by second (p90 as a bar, one # = 10 ms): one slow second for everyone is a stall, not a query",
  );
  const seconds = new Map<number, number[]>();
  for (const time of times) {
    const second = Math.floor((time.at - from) / 1000);
    const list = seconds.get(second) ?? [];
    list.push(time.total);
    seconds.set(second, list);
  }
  for (const [second, list] of [...seconds].toSorted((a, b) => a[0] - b[0])) {
    const sorted = list.toSorted((a, b) => a - b);
    const p90 = percentile(sorted, 0.9);
    const clock = new Date(from + second * 1000).toISOString().slice(11, 19);
    lines.push(
      `  ${clock} ${String(sorted.length).padStart(4)} req  median ${String(percentile(sorted, 0.5)).padStart(5)} ms  ${"#".repeat(Math.min(60, Math.round(p90 / 10)))}`,
    );
  }

  const slowSpans = spans.filter(
    (span) =>
      span.source.startsWith(API) &&
      isDatabaseSpan(span) &&
      span.durationMs >= 50 &&
      Date.parse(span.timestamp) >= from &&
      Date.parse(span.timestamp) <= to,
  );
  const byText = new Map<string, number[]>();
  for (const span of slowSpans) {
    const text = (span.attributes?.["db.query.text"] ?? span.attributes?.["db.statement"] ?? span.name)
      .replace(/\s+/g, " ")
      .slice(0, 110);
    const list = byText.get(text) ?? [];
    list.push(span.durationMs);
    byText.set(text, list);
  }
  lines.push(
    "",
    `Database spans of 50 ms or more: ${slowSpans.length} (pg-pool.connect is waiting for a connection, not a query)`,
  );
  for (const [text, list] of [...byText].toSorted((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
    lines.push(`  ${String(list.length).padStart(5)} × ${mean.toFixed(0).padStart(4)} ms  ${text}`);
  }
  return lines.join("\n");
}

interface Described {
  resources?: { displayName?: string }[];
}

/** The gateway and every dealership-api copy the running AppHost has. */
function resourceNames(): string[] {
  const output = Bun.spawnSync(["aspire", "describe", "--format", "Json", "--nologo"], {
    stderr: "ignore",
  }).stdout.toString();
  let described: Described = {};
  try {
    described = JSON.parse(output) as Described;
  } catch {
    console.error(
      "Could not read the running AppHost. Is `bun run dev` (or `start:prod`) running, with `aspire` on PATH?",
    );
    process.exit(1);
  }
  return (described.resources ?? [])
    .map((resource) => resource.displayName ?? "")
    .filter((name) => name === GATEWAY || name === API || /^dealership-api-\d+$/.test(name));
}

function spansOf(resource: string): TraceSpan[] {
  const output = Bun.spawnSync(
    ["aspire", "otel", "spans", resource, "--limit", "200000", "--format", "Json", "--nologo", "--non-interactive"],
    { stderr: "ignore" },
  ).stdout.toString();
  const start = output.indexOf("[");
  if (start < 0) {
    return [];
  }
  return JSON.parse(output.slice(start)) as TraceSpan[];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let to = Date.now();
  let from = to - 60_000;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1] ?? "";
    index += 1;
    if (option === "--seconds" && Number(value) > 0) {
      from = to - Number(value) * 1000;
    } else if (option === "--since" && !Number.isNaN(Date.parse(value))) {
      from = Date.parse(value);
    } else if (option === "--until" && !Number.isNaN(Date.parse(value))) {
      to = Date.parse(value);
    } else {
      console.error(USAGE);
      process.exit(1);
    }
  }
  const spans = resourceNames().flatMap(spansOf);
  console.log(report(spans, from, to));
}
