import type {PostgresDriverError} from '../problem-details/database-error';

/**
 * How deep the `cause` chain of an error is followed in the log: the error and up to three causes. Deeper causes are
 * replaced by a marker, so a cyclic or very long chain never floods the log.
 */
export const MAX_ERROR_CAUSE_DEPTH = 3;

export const CAUSE_DEPTH_REACHED = 'max_error_cause_depth_reached';

/**
 * An error, and the errors it was caused by (`new XError(message, {cause})`), as a plain object for a structured log
 * line. Includes the PostgreSQL fields of a failed query (SQLSTATE `code`, `constraint`, ...), which the problem
 * details sent to the client leave out. Fields an error does not have stay unset; the JSON log line leaves them out.
 */
export function serializeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  if (depth > MAX_ERROR_CAUSE_DEPTH) {
    return CAUSE_DEPTH_REACHED;
  }
  // TypeORM's QueryFailedError carries the driver's error; a driver error carries its fields itself.
  const database: PostgresDriverError = (error as {driverError?: PostgresDriverError}).driverError ?? error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: database.code,
    detail: database.detail,
    constraint: database.constraint,
    table: database.table,
    column: database.column,
    cause: serializeError(error.cause, depth + 1),
  };
}
