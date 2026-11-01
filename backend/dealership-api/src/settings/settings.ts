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

/** Injection token for `Settings`: classes take them through their constructor, as .NET classes take IOptions<T>. */
export const SETTINGS = Symbol('Settings');

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
  /** Aspire: the dealership database, as a .NET connection string. */
  ConnectionStrings__dealership?: string;
  /** Aspire: RabbitMQ's address. */
  ConnectionStrings__rabbitmq?: string;
  /** Aspire: identity-api's address (its signing keys come from there). */
  'services__identity-api__http__0'?: string;
  /** Aspire: document-api's address. */
  'services__document-api__http__0'?: string;
  /** Aspire: where traces, metrics and logs go. Unset: telemetry is off. */
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
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
  /** How long a unit of work waits for a free connection before failing, instead of hanging. */
  databaseConnectionTimeoutMs: number;
  /** What Aspire provides. Null outside Aspire (in a unit test); the module that needs one says so when it starts. */
  dealershipDatabase: string | null;
  rabbitmq: string | null;
  identityApiUrl: string | null;
  documentApiUrl: string | null;
  otlpEndpoint: string | null;
}

export function readSettings(environment: Environment): Settings {
  return {
    port: readWholeNumber('PORT', environment.PORT, 3000),
    logLevel: environment.LOG_LEVEL ?? 'info',
    requestTimeoutMs: readDuration('REQUEST_TIMEOUT', environment.REQUEST_TIMEOUT, '30s'),
    databaseStatementTimeoutMs: readDuration(
      'DATABASE_STATEMENT_TIMEOUT',
      environment.DATABASE_STATEMENT_TIMEOUT,
      '30s',
    ),
    databaseMaxConnections: readWholeNumber('DATABASE_MAX_CONNECTIONS', environment.DATABASE_MAX_CONNECTIONS, 10),
    databaseConnectionTimeoutMs: readDuration(
      'DATABASE_CONNECTION_TIMEOUT',
      environment.DATABASE_CONNECTION_TIMEOUT,
      '10s',
    ),
    dealershipDatabase: environment.ConnectionStrings__dealership ?? null,
    rabbitmq: environment.ConnectionStrings__rabbitmq ?? null,
    identityApiUrl: environment['services__identity-api__http__0'] ?? null,
    documentApiUrl: environment['services__document-api__http__0'] ?? null,
    otlpEndpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
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

function readWholeNumber(variable: keyof Environment, value: string | undefined, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${variable} must be a whole number above 0; it is "${value}".`);
  }
  return number;
}

const UNIT_MS = {ms: 1, s: 1000, m: 60_000, h: 3_600_000} as const;

/** A duration such as `500ms`, `30s` or `2m` (a bare number is milliseconds), in milliseconds. */
function readDuration(variable: keyof Environment, value: string | undefined, fallback: string): number {
  const text = value ?? fallback;
  const match = /^(\d+)(ms|s|m|h)?$/.exec(text.trim());
  if (!match) {
    throw new Error(`${variable} must be a duration such as 500ms, 30s or 2m; it is "${text}".`);
  }
  const unit = (match[2] ?? 'ms') as keyof typeof UNIT_MS;
  return Number(match[1]) * UNIT_MS[unit];
}

/**
 * The settings this process runs with, read once. Only startup code reads this directly (main.ts, app.module.ts,
 * logging, telemetry); everything else receives `Settings` through `SETTINGS`, so tests can pass their own.
 */
// oxlint-disable-next-line node/no-process-env -- the one place that reads the environment
export const settings: Settings = readSettings(process.env);
