import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { IdempotencyRecords } from "./idempotency-records";

const SWEEP_MS = 10 * 60_000;

/**
 * Deletes saves' keys past their 24 hours (ACME-125), every 10 minutes, in every instance of the API. Each delete is one
 * conditional statement, so two instances sweeping at once delete each key once. Nothing depends on it running on
 * time: a claim treats an expired key as free whether or not it is still there.
 */
@Injectable()
export class IdempotencySweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly _logger = new Logger(IdempotencySweeper.name);
  private readonly _records: IdempotencyRecords;
  private _timer: NodeJS.Timeout | null = null;

  public constructor(records: IdempotencyRecords) {
    this._records = records;
  }

  public onApplicationBootstrap(): void {
    this._timer = setInterval(() => void this.sweepAsync(), SWEEP_MS);
    // A timer that keeps nothing alive: shutting down never waits for the next sweep.
    this._timer.unref();
  }

  public onApplicationShutdown(): void {
    if (this._timer) {
      clearInterval(this._timer);
    }
  }

  /** One sweep, a batch at a time until none are left. Never rejects: a failed sweep is logged and tried next time. */
  public async sweepAsync(): Promise<void> {
    try {
      let deleted = 0;
      let batch: number;
      do {
        batch = await this._records.sweepAsync();
        deleted += batch;
      } while (batch > 0);
      if (deleted > 0) {
        this._logger.log(`Deleted ${deleted} expired idempotency keys.`);
      }
    } catch (error) {
      this._logger.error(`Sweeping idempotency keys failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
