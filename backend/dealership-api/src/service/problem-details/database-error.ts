import { englishMessage, type MessageKey } from "#i18n/messages";
import { HttpStatus } from "@nestjs/common";

/**
 * The fields of a PostgreSQL error as the driver (`pg`) throws it. Drizzle wraps it in its own error, as the `cause`.
 */
export interface PostgresDriverError extends Error {
  /** `ERROR`, `FATAL`, …: every error that came from the server has one. */
  severity?: string;
  /** The SQLSTATE code, e.g. `23505`. */
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

/** SQLSTATE codes this service answers with something better than a 500. */
export const POSTGRES_ERROR = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
  CHECK_VIOLATION: "23514",
  STRING_DATA_RIGHT_TRUNCATION: "22001",
  INVALID_TEXT_REPRESENTATION: "22P02",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  QUERY_CANCELED: "57014",
  LOCK_NOT_AVAILABLE: "55P03",
  TOO_MANY_CONNECTIONS: "53300",
  ADMIN_SHUTDOWN: "57P01",
  CANNOT_CONNECT_NOW: "57P03",
} as const;

/**
 * What the client is told. Never SQL, table or constraint names: those are in the log and the trace. `detail` is the
 * English text (for the log); the problem-details filter sends `key` in the request's language.
 */
export interface DatabaseProblem {
  status: number;
  key: MessageKey;
  detail: string;
  /** A problem type of its own, when the status's is not precise enough ("busy" is a 503 that will pass). */
  type?: string;
  /** Sent as `Retry-After`: when trying again makes sense. */
  retryAfterSeconds?: number;
}

function problem(status: number, key: MessageKey): DatabaseProblem {
  return { status, key, detail: englishMessage(key) };
}

const ALREADY_EXISTS = problem(HttpStatus.CONFLICT, "database.alreadyExists");
const REFERENCE_PROBLEM = problem(HttpStatus.CONFLICT, "database.referenceProblem");
const INVALID_VALUE = problem(HttpStatus.BAD_REQUEST, "database.invalidValue");
const CHANGED_CONCURRENTLY = problem(HttpStatus.CONFLICT, "database.changedConcurrently");
const DATABASE_UNAVAILABLE = problem(HttpStatus.SERVICE_UNAVAILABLE, "database.unavailable");
/**
 * Every connection a request may use was taken for longer than its wait (ACME-121): the system is busy, not down. Said
 * before the transaction began, so nothing was written; worth trying again in a second.
 */
const DATABASE_BUSY: DatabaseProblem = {
  ...problem(HttpStatus.SERVICE_UNAVAILABLE, "database.busy"),
  type: "urn:acme:error:busy",
  retryAfterSeconds: 1,
};

/** What persistence throws for "busy" (`DatabaseBusyError`), recognised by its name: the service may not import it. */
const BUSY_ERROR_NAME = "DatabaseBusyError";

const PROBLEM_BY_CODE: Readonly<Record<string, DatabaseProblem>> = {
  [POSTGRES_ERROR.UNIQUE_VIOLATION]: ALREADY_EXISTS,
  [POSTGRES_ERROR.FOREIGN_KEY_VIOLATION]: REFERENCE_PROBLEM,
  [POSTGRES_ERROR.NOT_NULL_VIOLATION]: INVALID_VALUE,
  [POSTGRES_ERROR.CHECK_VIOLATION]: INVALID_VALUE,
  [POSTGRES_ERROR.STRING_DATA_RIGHT_TRUNCATION]: INVALID_VALUE,
  [POSTGRES_ERROR.INVALID_TEXT_REPRESENTATION]: INVALID_VALUE,
  [POSTGRES_ERROR.SERIALIZATION_FAILURE]: CHANGED_CONCURRENTLY,
  [POSTGRES_ERROR.DEADLOCK_DETECTED]: CHANGED_CONCURRENTLY,
  [POSTGRES_ERROR.QUERY_CANCELED]: DATABASE_UNAVAILABLE,
  [POSTGRES_ERROR.LOCK_NOT_AVAILABLE]: DATABASE_UNAVAILABLE,
  [POSTGRES_ERROR.TOO_MANY_CONNECTIONS]: DATABASE_UNAVAILABLE,
  [POSTGRES_ERROR.ADMIN_SHUTDOWN]: DATABASE_UNAVAILABLE,
  [POSTGRES_ERROR.CANNOT_CONNECT_NOW]: DATABASE_UNAVAILABLE,
};

/**
 * A unique rule the user can break, by its index or constraint name (see the migrations), and what to tell them. The
 * handlers check these first for a friendlier message; this is the answer when two requests race past that check.
 */
const UNIQUE_RULES: Readonly<Record<string, MessageKey>> = {
  uq_parts_dealer_part_number: "database.partNumberExists",
  uq_bins_location_code: "database.binCodeExists",
  uq_part_inventories_location_part: "database.partAlreadyStocked",
};

/** Connection exceptions (`08xxx`): the database could not be reached at all. */
const CONNECTION_EXCEPTION_CLASS = "08";

/** How far down an error's `cause` chain to look for the PostgreSQL error. */
const MAX_CAUSE_DEPTH = 3;
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The problem to answer with for a failed query, or null when the error is not a database error this service knows
 * (it is then a 500 like any unexpected error).
 */
export function resolveDatabaseProblem(exception: unknown): DatabaseProblem | null {
  if (isBusy(exception)) {
    return DATABASE_BUSY;
  }
  const postgresError = findPostgresError(exception);
  if (!postgresError) {
    return null;
  }
  const code = postgresError.code ?? "";
  if (code === POSTGRES_ERROR.UNIQUE_VIOLATION && postgresError.constraint) {
    const key = UNIQUE_RULES[postgresError.constraint];
    if (key) {
      return problem(HttpStatus.CONFLICT, key);
    }
  }
  if (code.startsWith(CONNECTION_EXCEPTION_CLASS)) {
    return DATABASE_UNAVAILABLE;
  }
  return PROBLEM_BY_CODE[code] ?? null;
}

/**
 * The PostgreSQL error the exception is, or was caused by. Recognised by its shape (a server `severity` and a
 * SQLSTATE `code`), so this layer doesn't depend on the driver.
 */
function findPostgresError(exception: unknown): PostgresDriverError | null {
  let current: unknown = exception;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    const candidate = current as PostgresDriverError;
    if (typeof candidate.severity === "string" && SQLSTATE.test(candidate.code ?? "")) {
      return candidate;
    }
    current = current.cause;
  }
  return null;
}

/** The exception is, or was caused by, persistence's "busy": no connection came free in time. */
function isBusy(exception: unknown): boolean {
  let current: unknown = exception;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    if (current.name === BUSY_ERROR_NAME) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
