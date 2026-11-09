/**
 * dealership-api's settings: what a .NET service keeps in appsettings.json. This is the only file that reads the
 * environment (lint refuses `process.env` anywhere else). Each variable is named once, in `Environment`, and read as a
 * property, so a mistyped name is a type error rather than a setting that is silently missing. Values are checked
 * once, at startup: a mistyped value stops the service instead of being ignored.
 *
 *   REQUEST_TIMEOUT=45s DATABASE_STATEMENT_TIMEOUT=1m bun run dev
 *
 * Or in backend/dealership-api/.env (copy .env.example): Node reads it itself (--env-file-if-exists, no dotenv), and a
 * variable already set, by Aspire or your shell, wins over the file, as an environment variable wins over
 * appsettings.json in .NET.
 */

import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Injection token for `Settings`: classes take them through their constructor, as .NET classes take IOptions<T>. */
export const SETTINGS = Symbol("Settings");

/** The environment variables dealership-api reads. Aspire sets the connection strings and service addresses. */
export interface Environment {
  /** The port to listen on (Aspire sets it). */
  PORT?: string;
  /** pino's level: trace, debug, info, warn, error. */
  LOG_LEVEL?: string;
  /** A duration (`30s`): how long a request may take. */
  REQUEST_TIMEOUT?: string;
  /** A duration (`30s`): how long one SQL statement may run. */
  DATABASE_STATEMENT_TIMEOUT?: string;
  /** How many connections this instance keeps to the dealership database (instances × this ≤ Postgres's max). */
  DATABASE_MAX_CONNECTIONS?: string;
  /** A duration (`10s`): how long a request waits for a free database connection before it fails. */
  DATABASE_CONNECTION_TIMEOUT?: string;
  DATABASE_SAVE_CONNECTIONS?: string;
  DATABASE_LIST_WAIT?: string;
  DATABASE_SAVE_WAIT?: string;
  /** Aspire: the dealership database, as a .NET connection string. */
  ConnectionStrings__dealership?: string;
  /** Aspire: RabbitMQ's address. */
  ConnectionStrings__rabbitmq?: string;
  /** Aspire: identity-api's address (its signing keys come from there). */
  "services__identity-api__http__0"?: string;
  /** Aspire: document-api's address. */
  "services__document-api__http__0"?: string;
  /** Aspire: where traces, metrics and logs go. Unset: telemetry is off. */
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  /** Exports one export worker runs at once (each holds a database connection while it reads). */
  EXPORT_MAX_RUNNING?: string;
  /** Exports one dealer may have running at once, across every worker, so one dealer cannot take every slot. */
  EXPORT_MAX_RUNNING_PER_DEALER?: string;
  /** Exports one user may have running or waiting at once; another is refused (429) until one finishes. */
  EXPORT_MAX_PER_USER?: string;
  /** How often, in milliseconds, an export worker looks for waiting exports. */
  EXPORT_POLL_MS?: string;
  /** How often, in milliseconds, the API reads a followed export's state to send it to the browser. */
  EXPORT_PROGRESS_POLL_MS?: string;
  /** How long, in seconds, one of an export's SQL statements may run (its count, or its rows). */
  EXPORT_STATEMENT_TIMEOUT_SECONDS?: string;
  /** How long, in seconds, a whole export may run before it is stopped and failed. */
  EXPORT_MAX_SECONDS?: string;
  /** After how many seconds without a heartbeat a running export counts as abandoned by its worker. */
  EXPORT_STALE_SECONDS?: string;
  /** How long, in seconds, a finished export can be downloaded. */
  EXPORT_TTL_SECONDS?: string;
  /** Where export files are written. */
  EXPORT_DIR?: string;
  /** Rows per round trip while an export reads. */
  EXPORT_BATCH_SIZE?: string;
  /**
   * A secret of at least 32 characters that signs export download links; every API instance shares it, so a link
   * outlives a restart and any instance accepts it. Required in production; in development one is made at start.
   */
  EXPORT_LINK_KEY?: string;
  /** `production` in a deployment: Swagger UI and the OpenAPI document are then not served. */
  NODE_ENV?: string;
}

export interface Settings {
  port: number;
  logLevel: string;
  /** How long a request may take: then it is answered 504 and the calls it made to other services are cancelled. */
  requestTimeoutMs: number;
  /** How long one SQL statement may run before Postgres cancels it (Node cannot cancel a running query itself). */
  databaseStatementTimeoutMs: number;
  /** Connections this instance keeps to the database; every running unit of work holds one. */
  databaseMaxConnections: number;
  /** How long work outside a request (the export worker, the consumer) waits for a free connection, instead of hanging. */
  databaseConnectionTimeoutMs: number;
  /** Of `databaseMaxConnections`, the ones kept for saves, so lists can never take them all (ACME-121). */
  databaseSaveConnections: number;
  /** How long a request that reads waits for a connection before it is answered "busy" (503). */
  databaseListWaitMs: number;
  /** How long a request that saves waits for one of the save connections before it is answered "busy". */
  databaseSaveWaitMs: number;
  /** What Aspire provides. Null outside Aspire (in a unit test); the module that needs one says so when it starts. */
  dealershipDatabase: string | null;
  rabbitmq: string | null;
  identityApiUrl: string | null;
  documentApiUrl: string | null;
  otlpEndpoint: string | null;
  /** Exports this worker runs at once; the rest wait in line in the export_jobs table. */
  exportMaxRunning: number;
  exportMaxRunningPerDealer: number;
  exportMaxPerUser: number;
  exportPollMs: number;
  exportProgressPollMs: number;
  exportStatementTimeoutSeconds: number;
  exportMaxSeconds: number;
  exportStaleSeconds: number;
  exportFileTtlMs: number;
  /**
   * Where export files are written. The API and the export worker must see the same folder: the worker writes the
   * file, the API serves it. The default is under the operating system's temp folder, which is the same path for both
   * processes on one machine (Aspire starts both with the same environment). In production this would be object
   * storage (a bucket both reach), not a local folder.
   */
  exportDirectory: string;
  exportBatchSize: number;
  /** Signs export download links (EXPORT_LINK_KEY). */
  exportLinkKey: string;
  /** Swagger UI and the OpenAPI document: in development only (the API's map is nobody else's business). */
  serveSwagger: boolean;
}

export function readSettings(environment: Environment): Settings {
  return {
    port: readWholeNumber("PORT", environment.PORT, 3000),
    logLevel: environment.LOG_LEVEL ?? "info",
    requestTimeoutMs: readDuration("REQUEST_TIMEOUT", environment.REQUEST_TIMEOUT, "30s"),
    databaseStatementTimeoutMs: readDuration(
      "DATABASE_STATEMENT_TIMEOUT",
      environment.DATABASE_STATEMENT_TIMEOUT,
      "30s",
    ),
    // 12 a copy (8 for lists, 4 for saves). ACME-121 chose 5 while each query cost Postgres tens of milliseconds of
    // CPU: then more connections only queued more work on its cores (at 300 a second, 40 left 8,059 unanswered).
    // Since ACME-129 a query costs one to five: requests waited for a connection while Postgres used 4 of its 10
    // cores (600 a second: p95 570 ms, 3.5 queries running at a time on 16 connections).
    databaseMaxConnections: readWholeNumber("DATABASE_MAX_CONNECTIONS", environment.DATABASE_MAX_CONNECTIONS, 12),
    databaseConnectionTimeoutMs: readDuration(
      "DATABASE_CONNECTION_TIMEOUT",
      environment.DATABASE_CONNECTION_TIMEOUT,
      "10s",
    ),
    databaseSaveConnections: readWholeNumber("DATABASE_SAVE_CONNECTIONS", environment.DATABASE_SAVE_CONNECTIONS, 4),
    databaseListWaitMs: readDuration("DATABASE_LIST_WAIT", environment.DATABASE_LIST_WAIT, "1500ms"),
    databaseSaveWaitMs: readDuration("DATABASE_SAVE_WAIT", environment.DATABASE_SAVE_WAIT, "5s"),
    dealershipDatabase: environment.ConnectionStrings__dealership ?? null,
    rabbitmq: environment.ConnectionStrings__rabbitmq ?? null,
    identityApiUrl: environment["services__identity-api__http__0"] ?? null,
    documentApiUrl: environment["services__document-api__http__0"] ?? null,
    otlpEndpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    exportMaxRunning: readWholeNumber("EXPORT_MAX_RUNNING", environment.EXPORT_MAX_RUNNING, 5),
    exportMaxRunningPerDealer: readWholeNumber(
      "EXPORT_MAX_RUNNING_PER_DEALER",
      environment.EXPORT_MAX_RUNNING_PER_DEALER,
      3,
    ),
    exportMaxPerUser: readWholeNumber("EXPORT_MAX_PER_USER", environment.EXPORT_MAX_PER_USER, 2),
    exportPollMs: readWholeNumber("EXPORT_POLL_MS", environment.EXPORT_POLL_MS, 1000),
    exportProgressPollMs: readWholeNumber("EXPORT_PROGRESS_POLL_MS", environment.EXPORT_PROGRESS_POLL_MS, 1000),
    exportStatementTimeoutSeconds: readWholeNumber(
      "EXPORT_STATEMENT_TIMEOUT_SECONDS",
      environment.EXPORT_STATEMENT_TIMEOUT_SECONDS,
      600,
    ),
    exportMaxSeconds: readWholeNumber("EXPORT_MAX_SECONDS", environment.EXPORT_MAX_SECONDS, 900),
    exportStaleSeconds: readWholeNumber("EXPORT_STALE_SECONDS", environment.EXPORT_STALE_SECONDS, 60),
    exportFileTtlMs: readWholeNumber("EXPORT_TTL_SECONDS", environment.EXPORT_TTL_SECONDS, 900) * 1000,
    exportDirectory: environment.EXPORT_DIR ?? join(tmpdir(), "acme-dealership-exports"),
    exportBatchSize: readWholeNumber("EXPORT_BATCH_SIZE", environment.EXPORT_BATCH_SIZE, 20_000),
    exportLinkKey: readLinkKey(environment.EXPORT_LINK_KEY, environment.NODE_ENV),
    serveSwagger: environment.NODE_ENV !== "production",
  };
}

/**
 * A value the service cannot start without, or a clear error naming the variable (a key of `Environment`, so no typos
 * here). `bun run dev` runs under Aspire, which sets it; a deployment sets it in the service's environment.
 */
export function requireSetting(value: string | null, variable: keyof Environment): string {
  if (value === null || value.length === 0) {
    throw new Error(`${variable} is not set: Aspire sets it for bun run dev; a deployment sets it in the environment.`);
  }
  return value;
}

function readLinkKey(value: string | undefined, nodeEnvironment: string | undefined): string {
  if (value === undefined || value.length === 0) {
    // Any named environment but development and test (production, staging) may run several instances.
    if (nodeEnvironment !== undefined && nodeEnvironment !== "development" && nodeEnvironment !== "test") {
      throw new Error("EXPORT_LINK_KEY is not set: export download links need a key every API instance shares.");
    }
    // Development (no NODE_ENV under Aspire): one process serves the links, and a restart may forget them.
    return randomBytes(32).toString("base64url");
  }
  if (value.length < 32) {
    throw new Error("EXPORT_LINK_KEY must be at least 32 characters.");
  }
  return value;
}

function readWholeNumber(variable: keyof Environment, value: string | undefined, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${variable} must be a whole number above 0; it is "${value}".`);
  }
  return number;
}

const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const;

/** A duration such as `500ms`, `30s` or `2m` (a bare number is milliseconds), in milliseconds. */
function readDuration(variable: keyof Environment, value: string | undefined, fallback: string): number {
  const text = value ?? fallback;
  const match = /^(\d+)(ms|s|m|h)?$/.exec(text.trim());
  if (!match) {
    throw new Error(`${variable} must be a duration such as 500ms, 30s or 2m; it is "${text}".`);
  }
  const unit = (match[2] ?? "ms") as keyof typeof UNIT_MS;
  return Number(match[1]) * UNIT_MS[unit];
}

/**
 * The settings this process runs with, read once. Only startup code reads this directly (main.ts, app.module.ts,
 * logging, telemetry); everything else receives `Settings` through `SETTINGS`, so tests can pass their own.
 */
// oxlint-disable-next-line node/no-process-env -- the one place that reads the environment
export const settings: Settings = readSettings(process.env);
