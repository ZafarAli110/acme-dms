import {i18n} from '../../i18n';

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
  validation: 'urn:acme:error:validation',
  unauthorized: 'urn:acme:error:unauthorized',
  forbidden: 'urn:acme:error:forbidden',
  notFound: 'urn:acme:error:not-found',
  conflict: 'urn:acme:error:conflict',
  tooManyRequests: 'urn:acme:error:too-many-requests',
  internal: 'urn:acme:error:internal',
  serviceUnavailable: 'urn:acme:error:service-unavailable',
} as const;

/** A service answered with an error. `problem.traceId` finds the request in the Aspire dashboard. */
export class ApiError extends Error {
  public readonly problem: ProblemDetailsDto;

  public constructor(problem: ProblemDetailsDto) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
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
    super('The server cannot be reached. Check that the system is running and try again.');
    this.name = 'ServerUnreachableError';
  }
}

export class RequestTimeoutError extends Error {
  public constructor() {
    super('The server took too long to answer. Try again.');
    this.name = 'RequestTimeoutError';
  }
}

/** Errors worth retrying: nothing was wrong with the request itself. */
export function isTransientError(error: unknown): boolean {
  return error instanceof ServerUnreachableError || error instanceof RequestTimeoutError;
}

/**
 * The message to show for an error a clientAction returns as `{error}`: the service's problem detail, or a translated
 * message when the service could not be reached.
 */
export function problemErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ServerUnreachableError) {
    return i18n.t('errors.serverUnreachable');
  }
  if (error instanceof RequestTimeoutError) {
    return i18n.t('errors.timeout');
  }
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
