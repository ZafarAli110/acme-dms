import { describe, expect, test } from "bun:test";
import { percentile, report, requestTimes, type TraceSpan } from "./trace-breakdown";

const AT = Date.parse("2026-11-09T17:33:00Z");

/** One request: the gateway's server span, its session read, its call to the API, the API's span and its SQL. */
function request(
  trace: string,
  secondsIn: number,
  parts: { total: number; session: number; call: number; api: number; sql: number[]; wait?: number },
): TraceSpan[] {
  const timestamp = new Date(AT + secondsIn * 1000).toISOString();
  const db = { "db.system": "postgresql" };
  return [
    {
      traceId: trace,
      kind: "Server",
      name: "GET /api/dealership/v1/customers",
      source: "gateway-api",
      durationMs: parts.total,
      timestamp,
    },
    {
      traceId: trace,
      kind: "Client",
      name: "SELECT gateway",
      source: "gateway-api",
      durationMs: parts.session,
      timestamp,
      attributes: db,
    },
    {
      traceId: trace,
      kind: "Client",
      name: "GET",
      source: "gateway-api",
      destination: "dealership-api-2-abc",
      durationMs: parts.call,
      timestamp,
    },
    {
      traceId: trace,
      kind: "Server",
      name: "GET /v1/customers",
      source: "dealership-api-2",
      durationMs: parts.api,
      timestamp,
      attributes: { "http.route": "/v1/customers" },
    },
    ...(parts.wait === undefined
      ? []
      : [
          {
            traceId: trace,
            kind: "Internal",
            name: "pg-pool.connect",
            source: "dealership-api-2",
            durationMs: parts.wait,
            timestamp,
            attributes: db,
          },
        ]),
    ...parts.sql.map((ms, index) => ({
      traceId: trace,
      kind: "Client",
      name: `select ${index}`,
      source: "dealership-api-2",
      durationMs: ms,
      timestamp,
      attributes: { ...db, "db.query.text": `select ${index}` },
    })),
  ];
}

describe("trace-breakdown", () => {
  test("splits a request into session read, hop, API code, connection wait and SQL", () => {
    const spans = request("t1", 1, { total: 20, session: 2, call: 16, api: 14, sql: [3, 4], wait: 5 });

    const [time] = requestTimes(spans, AT, AT + 60_000);

    expect(time).toMatchObject({
      total: 20,
      sessionRead: 2,
      gatewayOther: 2,
      hop: 2,
      apiCode: 2,
      connectionWait: 5,
      sql: 7,
      slowestStatement: 4,
      statements: 2,
    });
  });

  test("leaves out requests outside the window and traces without the API's span", () => {
    const outside = request("t1", 120, { total: 10, session: 1, call: 8, api: 7, sql: [1] });
    const noApi = request("t2", 1, { total: 10, session: 1, call: 8, api: 7, sql: [1] }).filter(
      (span) => span.kind !== "Server" || span.source === "gateway-api",
    );

    expect(requestTimes([...outside, ...noApi], AT, AT + 60_000)).toEqual([]);
  });

  test("percentile reads the sorted list, and an empty one is 0", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(6);
    expect(percentile([], 0.95)).toBe(0);
  });

  test("the report names connection waits among the slow spans and shows the slow second", () => {
    const spans = [
      ...Array.from({ length: 19 }, (_, index) =>
        request(`fast${index}`, 1, { total: 8, session: 1, call: 6, api: 5, sql: [2] }),
      ).flat(),
      ...request("slow", 2, { total: 300, session: 1, call: 290, api: 200, sql: [20], wait: 170 }),
    ];

    const text = report(spans, AT, AT + 60_000);

    expect(text).toContain("20 traced requests: p50 8 ms, p95 300 ms");
    expect(text).toContain("pg-pool.connect");
    expect(text).toMatch(/17:33:02 +1 req {2}median +300 ms {2}#{30}/);
  });
});
