// Loaded with `node --import` before the app, so instrumentation is in place before any module is required.
// Exporters read OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVICE_NAME themselves (Aspire sets them for every resource);
// settings only decides whether telemetry is on.
import {register} from 'node:module';
import {OTLPLogExporter} from '@opentelemetry/exporter-logs-otlp-proto';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-proto';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-proto';
import {AmqplibInstrumentation} from '@opentelemetry/instrumentation-amqplib';
import {HttpInstrumentation} from '@opentelemetry/instrumentation-http';
import {PgInstrumentation} from '@opentelemetry/instrumentation-pg';
import {PinoInstrumentation} from '@opentelemetry/instrumentation-pino';
import {BatchLogRecordProcessor} from '@opentelemetry/sdk-logs';
import {PeriodicExportingMetricReader} from '@opentelemetry/sdk-metrics';
import {NodeSDK} from '@opentelemetry/sdk-node';
import {settings} from '#settings/settings';

if (settings.otlpEndpoint !== null) {
  // ESM modules (including node:http as imported by the Nest adapter) can only be patched through a loader hook.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({exporter: new OTLPMetricExporter()})],
    logRecordProcessors: [new BatchLogRecordProcessor({exporter: new OTLPLogExporter()})],
    // Pg: every SQL statement is a span under its request, with the query text (placeholders, never the values).
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
      new PinoInstrumentation(),
      new AmqplibInstrumentation(),
    ],
  });
  sdk.start();
}
