import type {Params} from 'nestjs-pino';
import {resolveCorrelationId} from '../correlation/correlation-id';

type Request = {headers: Record<string, string | string[] | undefined>; correlationId?: string};

/**
 * Structured JSON logs. Every line carries the correlation id; OpenTelemetry's pino instrumentation adds the
 * trace and span ids and forwards each line to the Aspire dashboard's structured logs.
 */
export const loggerOptions: Params = {
  pinoHttp: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    genReqId: (request) => resolveCorrelationId(request as unknown as Request),
    customAttributeKeys: {reqId: 'correlationId'},
    customProps: (request) => ({locationId: request.headers['x-location-id'] ?? null}),
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    // Health probes run every few seconds; logging them would drown everything else.
    autoLogging: {ignore: (request) => request.url?.endsWith('/health') ?? false},
  },
};
