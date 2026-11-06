import { Module } from "@nestjs/common";
import { CLOCK } from "#business-logic-abstractions/time/clock.interface";
import { PersistenceModule } from "#persistence/persistence.module";
import { SystemClock } from "../time/system-clock";
import { ExportWorker } from "./export-worker";

/**
 * What the export worker process runs (service/worker.ts): the database, the clock and the worker, and nothing of the
 * API's (no handlers, no controllers, no HTTP).
 */
@Module({
  imports: [PersistenceModule],
  providers: [{ provide: CLOCK, useClass: SystemClock }, ExportWorker],
})
export class ExportWorkerModule {}
