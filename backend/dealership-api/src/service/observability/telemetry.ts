// Loaded with `node --import` before the app, so instrumentation is in place before any module is required.
// Exporters read OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVICE_NAME, which Aspire sets for every resource.
import {register} from 'node:module';
import {OTLPLogExporter} from '@opentelemetry/exporter-logs-otlp-proto';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-proto';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-proto';
import {AmqplibInstrumentation} from '@opentelemetry/instrumentation-amqplib';
import {HttpInstrumentation} from '@opentelemetry/instrumentation-http';
import {PinoInstrumentation} from '@opentelemetry/instrumentation-pino';
import {BatchLogRecordProcessor} from '@opentelemetry/sdk-logs';
import {PeriodicExportingMetricReader} from '@opentelemetry/sdk-metrics';
import {NodeSDK} from '@opentelemetry/sdk-node';

if (process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
  // ESM modules (including node:http as imported by the Nest adapter) can only be patched through a loader hook.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({exporter: new OTLPMetricExporter()})],
    logRecordProcessors: [new BatchLogRecordProcessor({exporter: new OTLPLogExporter()})],
    instrumentations: [new HttpInstrumentation(), new PinoInstrumentation(), new AmqplibInstrumentation()],
  });
  sdk.start();
}
