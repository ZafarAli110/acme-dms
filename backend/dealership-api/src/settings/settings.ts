/**
 * dealership-api's settings: what a .NET service keeps in appsettings.json. Each comes from an environment variable
 * (set by Aspire, a container or your shell) with the default written here, and is read and checked once, at startup,
 * so a mistyped value stops the service instead of being ignored.
 *
 *   REQUEST_TIMEOUT=45s DATABASE_STATEMENT_TIMEOUT=1m bun run dev
 */
export interface Settings {
  /** How long a request may take: then it is answered 504 and the calls it made to other services are cancelled. */
  requestTimeoutMs: number;
  /** How long one SQL statement may run before Postgres cancels it (Node cannot cancel a running query itself). */
  databaseStatementTimeoutMs: number;
}

export function readSettings(environment: Record<string, string | undefined>): Settings {
  return {
    requestTimeoutMs: readDuration(environment, 'REQUEST_TIMEOUT', '30s'),
    databaseStatementTimeoutMs: readDuration(environment, 'DATABASE_STATEMENT_TIMEOUT', '30s'),
  };
}

const UNIT_MS = {ms: 1, s: 1000, m: 60_000, h: 3_600_000} as const;

/** A duration such as `500ms`, `30s` or `2m` (a bare number is milliseconds), in milliseconds. */
function readDuration(environment: Record<string, string | undefined>, name: string, fallback: string): number {
  const value = environment[name] ?? fallback;
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`${name} must be a duration such as 500ms, 30s or 2m; it is "${value}".`);
  }
  const unit = (match[2] ?? 'ms') as keyof typeof UNIT_MS;
  return Number(match[1]) * UNIT_MS[unit];
}

/** The settings this process runs with. */
export const settings: Settings = readSettings(process.env);
