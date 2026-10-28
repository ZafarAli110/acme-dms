import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import {STATUS_CODES} from 'node:http';
import {trace} from '@opentelemetry/api';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import {toIsoString} from '#business-logic-abstractions/time/to-iso-string';
import type {ProblemDetailsDto} from '../problem-details/problem-details.dto';
import {DEFAULT_PROBLEM_TYPE, PROBLEM_TYPE_BY_STATUS} from '../problem-details/problem-type';

type ProblemRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  accessToken?: {sub: string};
};
type ProblemResponse = {
  status(code: number): ProblemResponse;
  setHeader(name: string, value: string): void;
  end(body: string): void;
};

/**
 * Turns every exception into RFC 9457 problem details (`application/problem+json`).
 * Handlers throw Nest's built-in exceptions (NotFoundException, ConflictException, ...); nothing else leaks internals.
 */
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

    const status = this.resolveStatus(exception);
    const problem = this.buildProblemDetails(exception, request, status);

    // Client errors (4xx) are expected outcomes; only server errors are logged as errors.
    const log = status >= 500 ? this._logger.error.bind(this._logger) : this._logger.warn.bind(this._logger);
    log('handled_exception', {
      type: problem.type,
      status,
      method: request.method,
      instance: problem.instance,
      traceId: problem.traceId,
      error:
        exception instanceof Error
          ? {name: exception.name, message: exception.message, stack: exception.stack}
          : exception,
    });

    response.setHeader('content-type', 'application/problem+json');
    response.status(status).end(JSON.stringify(problem));
  }

  private resolveStatus(exception: unknown): number {
    return exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private buildProblemDetails(exception: unknown, request: ProblemRequest, status: number): ProblemDetailsDto {
    const location = request.headers['x-location-id'];
    return {
      type: PROBLEM_TYPE_BY_STATUS[status] ?? DEFAULT_PROBLEM_TYPE,
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: this.resolveDetail(exception),
      instance: request.url ?? null,
      location: typeof location === 'string' ? location : null,
      userId: request.accessToken?.sub ?? null,
      traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
      timestamp: toIsoString(this._clock.now()),
    };
  }

  private resolveDetail(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      // Unexpected errors: never leak internals to the client. The full error is in the log and the trace.
      return 'An unexpected error occurred';
    }
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return body;
    }
    const {message, error} = body as {message?: string | string[]; error?: string};
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    return message ?? error ?? exception.message;
  }
}
