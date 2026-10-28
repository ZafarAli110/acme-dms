import {Injectable, type NestMiddleware} from '@nestjs/common';
import {trace} from '@opentelemetry/api';
import {CORRELATION_ID_HEADER, resolveCorrelationId} from '../correlation/correlation-id';

type Request = {headers: Record<string, string | string[] | undefined>; correlationId?: string};
type Response = {setHeader(name: string, value: string): void};

/** Echoes the correlation id in the response and tags it on the trace. Logs pick it up from the logger config. */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: () => void): void {
    const correlationId = resolveCorrelationId(request);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    trace.getActiveSpan()?.setAttribute('correlation.id', correlationId);
    next();
  }
}
