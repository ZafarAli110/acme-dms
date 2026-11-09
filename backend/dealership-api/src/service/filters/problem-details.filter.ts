import type { LocalizedMessageList } from "../validation/valibot-pipe";
import { NotModifiedException } from "../concurrency/record-version";
import { isLocalizedMessage, translateMessage } from "#i18n/messages";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from "@nestjs/common";
import { STATUS_CODES } from "node:http";
import { trace } from "@opentelemetry/api";
import { TooManyRequestsException } from "#business-logic-abstractions/errors/too-many-requests.exception";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import { toIsoString } from "#business-logic-abstractions/time/to-iso-string";
import { serializeError } from "../logging/serialize-error";
import { resolveDatabaseProblem } from "../problem-details/database-error";
import type { ProblemDetailsDto } from "../problem-details/problem-details.dto";
import { TypedProblemException } from "../problem-details/typed-problem.exception";
import { DEFAULT_PROBLEM_TYPE, PROBLEM_TYPE_BY_STATUS } from "../problem-details/problem-type";

type ProblemRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  accessToken?: { sub: string };
};
type ProblemResponse = {
  status(code: number): ProblemResponse;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

/**
 * Turns every exception into RFC 9457 problem details (`application/problem+json`).
 * Handlers throw Nest's built-in exceptions (NotFoundException, ConflictException, ...). A failed query that breaks a
 * database rule (a unique index, a foreign key, a lock timeout) gets its own status and a safe message
 * (`database-error.ts`). Nothing else leaks internals: the log line has the whole error and its `cause` chain.
 */
/** A validation failure with one message per problem, each translated (valibot-pipe.ts). */
function isLocalizedMessageList(value: unknown): value is LocalizedMessageList {
  return typeof value === "object" && value !== null && "i18nList" in value;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly _logger = new Logger(ProblemDetailsFilter.name);
  private readonly _clock: IClock;

  public constructor(@Inject(CLOCK) clock: IClock) {
    this._clock = clock;
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<ProblemRequest>();
    const response = httpContext.getResponse<ProblemResponse>();

    // Not an error: the client already has this version. The status and the ETag, no body, nothing to log.
    if (exception instanceof NotModifiedException) {
      response.setHeader("etag", exception.etag);
      response.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    const status = this.resolveStatus(exception);
    const problem = this.buildProblemDetails(exception, request, status);

    // Client errors (4xx) are expected outcomes; only server errors are logged as errors.
    const log = status >= 500 ? this._logger.error.bind(this._logger) : this._logger.warn.bind(this._logger);
    log("handled_exception", {
      type: problem.type,
      status,
      method: request.method,
      instance: problem.instance,
      traceId: problem.traceId,
      error: serializeError(exception),
    });

    response.setHeader("content-type", "application/problem+json");
    const retryAfterSeconds =
      exception instanceof TooManyRequestsException || exception instanceof TypedProblemException
        ? exception.retryAfterSeconds
        : resolveDatabaseProblem(exception)?.retryAfterSeconds;
    if (retryAfterSeconds) {
      response.setHeader("retry-after", String(retryAfterSeconds));
    }
    // Extension members (RFC 9457) follow the standard ones, only on the problem types that define them.
    const extensions = exception instanceof TypedProblemException ? exception.extensions : null;
    response.status(status).end(JSON.stringify(extensions ? { ...problem, ...extensions } : problem));
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return resolveDatabaseProblem(exception)?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildProblemDetails(exception: unknown, request: ProblemRequest, status: number): ProblemDetailsDto {
    const location = request.headers["x-location-id"];
    return {
      type: this.resolveType(exception, status),
      title: STATUS_CODES[status] ?? "Error",
      status,
      detail: this.resolveDetail(exception),
      instance: request.url ?? null,
      location: typeof location === "string" ? location : null,
      userId: request.accessToken?.sub ?? null,
      traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
      timestamp: toIsoString(this._clock.now()),
    };
  }

  /** The status's type, unless the error or a database problem has a more precise one ("busy", "save-in-progress"). */
  private resolveType(exception: unknown, status: number): string {
    if (exception instanceof TypedProblemException) {
      return exception.problemType;
    }
    const precise = exception instanceof HttpException ? null : (resolveDatabaseProblem(exception)?.type ?? null);
    return precise ?? PROBLEM_TYPE_BY_STATUS[status] ?? DEFAULT_PROBLEM_TYPE;
  }

  /** The detail in the request's language (`Accept-Language`); the log keeps the English one. */
  private resolveDetail(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      // Unexpected errors: never leak internals to the client. The full error is in the log and the trace.
      return translateMessage(resolveDatabaseProblem(exception)?.key ?? "database.unexpected");
    }
    const body = exception.getResponse();
    if (isLocalizedMessage(body)) {
      return translateMessage(body.i18n.key, body.i18n.args);
    }
    if (typeof body === "string") {
      return body;
    }
    if (isLocalizedMessageList(body)) {
      return body.i18nList.map((entry) => translateMessage(entry.key, entry.args)).join("; ");
    }
    const { message, error } = body as { message?: string | string[]; error?: string };
    if (Array.isArray(message)) {
      return message.join("; ");
    }
    return message ?? error ?? exception.message;
  }
}
