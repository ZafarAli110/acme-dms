// Temporal is built into Node 26; on an older Node (or Bun) the polyfill fills in. It leaves a native one alone.
import "temporal-polyfill/global";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { WorkerModule } from "./worker.module";

/**
 * The export worker: a process of its own, beside the API, that runs the exports the API queues (export_jobs). Run as
 * many as needed; each claims its own jobs. On SIGTERM it stops taking exports and lets the running ones finish; if it
 * is killed first, another worker's sweeper gives them back to the line.
 */
async function bootstrapAsync(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log("dealership-api export worker started");
}

await bootstrapAsync();
