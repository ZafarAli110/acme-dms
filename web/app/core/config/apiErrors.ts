import { i18n } from "../../i18n";

/** The error contract every Acme service returns (`application/problem+json`, docs/standards/api-errors.md). */
export interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string | null;
  instance: string | null;
  location: string | null;
  userId: string | null;
  traceId: string | null;
  timestamp: string;
}

/** The `type` of each problem, as the services send it. */
export const PROBLEM_TYPE = {
  validation: "urn:acme:error:validation",
  unauthorized: "urn:acme:error:unauthorized",
  forbidden: "urn:acme:error:forbidden",
  notFound: "urn:acme:error:not-found",
  conflict: "urn:acme:error:conflict",
  tooManyRequests: "urn:acme:error:too-many-requests",
  internal: "urn:acme:error:internal",
  serviceUnavailable: "urn:acme:error:service-unavailable",
  /** Too much at once: nothing was done, and trying again in a second may work (`Retry-After`, ACME-121). */
  busy: "urn:acme:error:busy",
  /** A save with this Idempotency-Key is still running (ACME-125). */
  saveInProgress: "urn:acme:error:save-in-progress",
  /** A save with this Idempotency-Key already went through, from another request: `resource` is where (ACME-125). */
  saveWentThrough: "urn:acme:error:save-went-through",
} as const;

/** A service answered with an error. `problem.traceId` finds the request in the Aspire dashboard. */
export class ApiError extends Error {
  public readonly problem: ProblemDetailsDto;

  public constructor(problem: ProblemDetailsDto) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }

  public get status(): number {
    return this.problem.status;
  }

  public get type(): string {
    return this.problem.type;
  }
}

/** The request never reached a service (gateway down, network error). */
export class ServerUnreachableError extends Error {
  public constructor() {
    super("The server cannot be reached. Check that the system is running and try again.");
    this.name = "ServerUnreachableError";
  }
}

export class RequestTimeoutError extends Error {
  public constructor() {
    super("The server took too long to answer. Try again.");
    this.name = "RequestTimeoutError";
  }
}

/** Errors worth retrying: nothing was wrong with the request itself. */
export function isTransientError(error: unknown): boolean {
  return error instanceof ServerUnreachableError || error instanceof RequestTimeoutError;
}

/**
 * The system had too much at once and did nothing (ACME-121). Known by its type, not its status: a database that is
 * down is also a 503, and is not worth trying again in a second.
 */
export function isBusyError(error: unknown): boolean {
  return error instanceof ApiError && error.type === PROBLEM_TYPE.busy;
}

/**
 * A save sent with a key already went through, from the form as it was before (ACME-125): where the saved record is
 * read in the app (`/customers/{id}`), or null when the service did not know. Null too for any other error.
 */
export function wentThroughPath(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.type !== PROBLEM_TYPE.saveWentThrough) {
    return null;
  }
  const { resource } = error.problem as ProblemDetailsDto & { resource?: string | null };
  // The service's path (`/v1/customers/{id}`) without its version is the app's route to the same record.
  return typeof resource === "string" ? resource.replace(/^\/v1\//, "/") : null;
}

/** Whether the error says a save with this key went through (whether or not it says where). */
export function isSaveWentThrough(error: unknown): boolean {
  return error instanceof ApiError && error.type === PROBLEM_TYPE.saveWentThrough;
}

/**
 * The message for a save sent with an Idempotency-Key that did not come back saved (ACME-125). No answer may mean it was
 * saved: the form says so, and that saving again is safe; a save still running says to wait. Anything else as
 * `problemErrorMessage`.
 */
export function saveErrorMessage(error: unknown, fallback: string): string {
  if (isTransientError(error)) {
    return i18n.t("errors.saveUnconfirmed");
  }
  if (error instanceof ApiError && error.type === PROBLEM_TYPE.saveInProgress) {
    return i18n.t("errors.saveInProgress");
  }
  if (isSaveWentThrough(error)) {
    return i18n.t("saves.wentThroughElsewhere");
  }
  return problemErrorMessage(error, fallback);
}

/**
 * The message to show for an error a clientAction returns as `{error}`: the service's problem detail, or a translated
 * message when the service could not be reached. The actions are saves (and sign-in, which is never busy), so busy says
 * that nothing was saved and the form still holds what was typed.
 */
export function problemErrorMessage(error: unknown, fallback: string): string {
  if (isBusyError(error)) {
    return i18n.t("errors.busySave");
  }
  if (error instanceof ServerUnreachableError) {
    return i18n.t("errors.serverUnreachable");
  }
  if (error instanceof RequestTimeoutError) {
    return i18n.t("errors.timeout");
  }
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
