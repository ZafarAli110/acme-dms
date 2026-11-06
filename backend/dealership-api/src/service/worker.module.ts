import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ExportWorkerModule } from "#business-logic/exports/export-worker.module";
import { SettingsModule } from "#settings/settings.module";
import { loggerOptions } from "./logging/logger-options";

/**
 * The export worker process's composition root (worker.ts): settings, the structured logger and the export worker.
 * No HTTP, no controllers, no handlers: the API queues exports, this process runs them.
 */
@Module({
  imports: [SettingsModule, LoggerModule.forRoot(loggerOptions), ExportWorkerModule],
})
export class WorkerModule {}
