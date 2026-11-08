import { describe, expect, it } from "vitest";
import { readSettings, requireSetting } from "../settings";

describe("readSettings", () => {
  it("serves Swagger outside production only", () => {
    expect(readSettings({}).serveSwagger).toBe(true);
    expect(
      readSettings({ NODE_ENV: "production", EXPORT_LINK_KEY: "a-key-every-api-instance-shares-0123456789" })
        .serveSwagger,
    ).toBe(false);
  });

  it("uses the defaults when nothing is set, and null for what only Aspire or a deployment provides", () => {
    expect(readSettings({})).toEqual({
      port: 3000,
      logLevel: "info",
      requestTimeoutMs: 30_000,
      serveSwagger: true,
      databaseStatementTimeoutMs: 30_000,
      databaseMaxConnections: 5,
      databaseConnectionTimeoutMs: 10_000,
      databaseSaveConnections: 2,
      databaseListWaitMs: 1_500,
      databaseSaveWaitMs: 5_000,
      dealershipDatabase: null,
      rabbitmq: null,
      identityApiUrl: null,
      documentApiUrl: null,
      otlpEndpoint: null,
      exportMaxRunning: 5,
      exportMaxRunningPerDealer: 3,
      exportMaxPerUser: 2,
      exportPollMs: 1000,
      exportProgressPollMs: 1000,
      exportStatementTimeoutSeconds: 600,
      exportMaxSeconds: 900,
      exportStaleSeconds: 60,
      exportFileTtlMs: 900_000,
      exportDirectory: expect.stringContaining("acme-dealership-exports"),
      exportBatchSize: 20_000,
      exportLinkKey: expect.any(String),
    });
  });

  it("needs a shared export link key in production, of at least 32 characters, and makes one in development", () => {
    expect(() => readSettings({ NODE_ENV: "production" })).toThrow(/EXPORT_LINK_KEY/);
    expect(() => readSettings({ NODE_ENV: "staging" })).toThrow(/EXPORT_LINK_KEY/);
    expect(readSettings({ NODE_ENV: "development" }).exportLinkKey.length).toBeGreaterThanOrEqual(32);
    expect(() => readSettings({ EXPORT_LINK_KEY: "too-short" })).toThrow(/EXPORT_LINK_KEY/);
    const key = "a-key-every-api-instance-shares-0123456789";
    expect(readSettings({ NODE_ENV: "production", EXPORT_LINK_KEY: key }).exportLinkKey).toBe(key);
    expect(readSettings({}).exportLinkKey.length).toBeGreaterThanOrEqual(32);
  });

  it("reads durations in ms, s, m or h", () => {
    expect(readSettings({ REQUEST_TIMEOUT: "45s", DATABASE_STATEMENT_TIMEOUT: "500ms" })).toMatchObject({
      requestTimeoutMs: 45_000,
      databaseStatementTimeoutMs: 500,
    });
    expect(readSettings({ REQUEST_TIMEOUT: "2m" }).requestTimeoutMs).toBe(120_000);
  });

  it("refuses a value that is not a duration or a port, naming the variable", () => {
    expect(() => readSettings({ REQUEST_TIMEOUT: "thirty seconds" })).toThrow(/REQUEST_TIMEOUT/);
    expect(() => readSettings({ PORT: "eighty" })).toThrow(/PORT/);
    expect(() => readSettings({ DATABASE_MAX_CONNECTIONS: "0" })).toThrow(/DATABASE_MAX_CONNECTIONS/);
  });

  it("says which variable is missing, for development and for a deployment", () => {
    expect(() => requireSetting(null, "ConnectionStrings__dealership")).toThrow(
      /ConnectionStrings__dealership is not set: Aspire sets it .* a deployment sets it/,
    );
    expect(requireSetting("Host=db", "ConnectionStrings__dealership")).toBe("Host=db");
  });
});
