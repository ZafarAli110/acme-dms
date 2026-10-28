import {HttpStatus} from '@nestjs/common';

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
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  INVALID_TEXT_REPRESENTATION: '22P02',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  QUERY_CANCELED: '57014',
  LOCK_NOT_AVAILABLE: '55P03',
  TOO_MANY_CONNECTIONS: '53300',
  ADMIN_SHUTDOWN: '57P01',
  CANNOT_CONNECT_NOW: '57P03',
} as const;

/** What the client is told. Never SQL, table or constraint names: those are in the log and the trace. */
export interface DatabaseProblem {
  status: number;
  detail: string;
}

const ALREADY_EXISTS: DatabaseProblem = {
  status: HttpStatus.CONFLICT,
  detail: 'A record with the same value already exists.',
};
const REFERENCE_PROBLEM: DatabaseProblem = {
  status: HttpStatus.CONFLICT,
  detail: 'This refers to a record that does not exist, or the record is still in use.',
};
const INVALID_VALUE: DatabaseProblem = {
  status: HttpStatus.BAD_REQUEST,
  detail: 'A value is missing or not allowed.',
};
const CHANGED_CONCURRENTLY: DatabaseProblem = {
  status: HttpStatus.CONFLICT,
  detail: 'The record was changed at the same time by someone else. Try again.',
};
const DATABASE_UNAVAILABLE: DatabaseProblem = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  detail: 'The database is busy or unavailable. Try again shortly.',
};

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
const UNIQUE_RULES: Readonly<Record<string, string>> = {
  uq_parts_part_number: 'A part with this part number already exists in your catalogue.',
  uq_bins_location_code: 'A bin with this code already exists at this location.',
  uq_part_inventories_location_part: 'This part is already stocked at this location.',
};

/** Connection exceptions (`08xxx`): the database could not be reached at all. */
const CONNECTION_EXCEPTION_CLASS = '08';

/** How far down an error's `cause` chain to look for the PostgreSQL error. */
const MAX_CAUSE_DEPTH = 3;
const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The problem to answer with for a failed query, or null when the error is not a database error this service knows
 * (it is then a 500 like any unexpected error).
 */
export function resolveDatabaseProblem(exception: unknown): DatabaseProblem | null {
  const postgresError = findPostgresError(exception);
  if (!postgresError) {
    return null;
  }
  const code = postgresError.code ?? '';
  if (code === POSTGRES_ERROR.UNIQUE_VIOLATION && postgresError.constraint) {
    const detail = UNIQUE_RULES[postgresError.constraint];
    if (detail) {
      return {status: HttpStatus.CONFLICT, detail};
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
    if (typeof candidate.severity === 'string' && SQLSTATE.test(candidate.code ?? '')) {
      return candidate;
    }
    current = current.cause;
  }
  return null;
}
