import {trace} from '@opentelemetry/api';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
const MAX_LENGTH = 128;

type CorrelatedRequest = {headers: Record<string, string | string[] | undefined>; correlationId?: string};

/**
 * The caller's `x-correlation-id` if it sent a usable one, otherwise the current trace id.
 * Cached on the request, so the logger and the middleware always agree on the value.
 */
export function resolveCorrelationId(request: CorrelatedRequest): string {
  if (request.correlationId) {
    return request.correlationId;
  }
  const incoming = request.headers[CORRELATION_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  request.correlationId =
    candidate && candidate.length <= MAX_LENGTH
      ? candidate
      : (trace.getActiveSpan()?.spanContext().traceId ?? crypto.randomUUID());
  return request.correlationId;
}
