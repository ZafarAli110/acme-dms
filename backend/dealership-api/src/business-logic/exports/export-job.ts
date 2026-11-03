import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import type { ExportJobStatus } from "#dto/exports/export-job-response.dto";
import type { ExportSource } from "./export-source";

const FINISHED: ReadonlySet<ExportJobStatus> = new Set(["completed", "failed", "cancelled", "expired"]);
/** Progress is reported at most this often: the user sees it move, not every row. */
const PROGRESS_INTERVAL_MS = 250;

/**
 * One export, as a background job: the request that starts it returns at once with the job's id, and the work runs
 * after it, in ExportJobRunner (it waits in line, a few run at once, it can be cancelled, its file expires). "Job" is
 * that run; the user only ever sees "an export". This class holds the run's state; export-job.mapper.ts turns it into
 * the response the client polls and streams.
 */
export class ExportJob {
  public readonly id = randomUUID();
  public readonly ownerId: string;
  public readonly locationId: string;
  public readonly source: ExportSource;
  public readonly abort = new AbortController();
  /** Fires on every status change and, while rows are written, every PROGRESS_INTERVAL_MS. */
  public readonly changes = new Subject<void>();
  public filePath: string | null = null;
  public queuePosition: number | null = null;
  private readonly _createdAt = Date.now();
  private _status: ExportJobStatus = "queued";
  private _rows = 0;
  private _totalRows: number | null = null;
  private _firstRowAt: number | null = null;
  private _lastReportAt = 0;
  private _fileBytes: number | null = null;
  private _expiresAt: number | null = null;
  private _finishedAt: number | null = null;
  private _error: string | null = null;

  public constructor(ownerId: string, locationId: string, source: ExportSource) {
    this.ownerId = ownerId;
    this.locationId = locationId;
    this.source = source;
  }

  public get status(): ExportJobStatus {
    return this._status;
  }

  public get isFinished(): boolean {
    return FINISHED.has(this._status);
  }

  public get expiresAt(): number | null {
    return this._expiresAt;
  }

  public get finishedAt(): number | null {
    return this._finishedAt;
  }

  public get fileBytes(): number | null {
    return this._fileBytes;
  }

  public get createdAt(): number {
    return this._createdAt;
  }

  public get rows(): number {
    return this._rows;
  }

  public get totalRows(): number | null {
    return this._totalRows;
  }

  /** When the first row was written: throughput counts from here, not from the wait for the sort. */
  public get firstRowAt(): number | null {
    return this._firstRowAt;
  }

  public get error(): string | null {
    return this._error;
  }

  public startCounting(): void {
    this.setStatus("counting");
  }

  public startWriting(totalRows: number): void {
    this._totalRows = totalRows;
    this.setStatus("writing");
  }

  public rowWritten(): void {
    this._rows++;
    const now = Date.now();
    this._firstRowAt ??= now;
    if (now - this._lastReportAt >= PROGRESS_INTERVAL_MS) {
      this._lastReportAt = now;
      this.changes.next();
    }
  }

  public complete(fileBytes: number, expiresAt: number): void {
    this._fileBytes = fileBytes;
    this._expiresAt = expiresAt;
    this.setStatus("completed");
  }

  public fail(status: "failed" | "cancelled", error: string): void {
    this._error = error;
    this.setStatus(status);
  }

  public expire(): void {
    this.setStatus("expired");
  }

  private setStatus(status: ExportJobStatus): void {
    this._status = status;
    if (FINISHED.has(status)) {
      this._finishedAt ??= Date.now();
    }
    this.changes.next();
    if (FINISHED.has(status) && status !== "expired") {
      this.changes.complete();
    }
  }
}
