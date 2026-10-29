import {randomUUID} from 'node:crypto';
import {Subject} from 'rxjs';
import type {ExportJobResponseDto, ExportJobStatus} from '#dto/exports/export-job-response.dto';
import {signedDownloadPath} from './download-link';
import type {ExportSource} from './export-source';

const FINISHED: ReadonlySet<ExportJobStatus> = new Set(['completed', 'failed', 'cancelled', 'expired']);
/** Progress is reported at most this often: the user sees it move, not every row. */
const PROGRESS_INTERVAL_MS = 250;

/** One export: who asked, what it reads, how far it has got. Lives in the runner while its file is kept. */
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
  private _status: ExportJobStatus = 'queued';
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

  public startCounting(): void {
    this.setStatus('counting');
  }

  public startWriting(totalRows: number): void {
    this._totalRows = totalRows;
    this.setStatus('writing');
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
    this.setStatus('completed');
  }

  public fail(status: 'failed' | 'cancelled', error: string): void {
    this._error = error;
    this.setStatus(status);
  }

  public expire(): void {
    this.setStatus('expired');
  }

  public toDto(): ExportJobResponseDto {
    const now = Date.now();
    // Throughput counts from the first row: the wait for the sort (seconds on an unindexed column) is not writing.
    const writingMs = this._firstRowAt === null ? 0 : now - this._firstRowAt;
    const rowsPerSecond = writingMs > 500 ? Math.round((this._rows / writingMs) * 1000) : null;
    const remaining = this._totalRows === null ? null : this._totalRows - this._rows;
    return {
      id: this.id,
      status: this._status,
      rows: this._rows,
      totalRows: this._totalRows,
      rowsPerSecond,
      elapsedMs: now - this._createdAt,
      etaMs:
        this._status === 'writing' && remaining !== null && rowsPerSecond
          ? Math.round((remaining / rowsPerSecond) * 1000)
          : null,
      queuePosition: this._status === 'queued' ? this.queuePosition : null,
      fileName: this.source.fileName,
      fileBytes: this._fileBytes,
      downloadPath:
        this._status === 'completed' && this._expiresAt !== null ? signedDownloadPath(this.id, this._expiresAt) : null,
      expiresAt: this._expiresAt === null ? null : Temporal.Instant.fromEpochMilliseconds(this._expiresAt).toString(),
      error: this._error,
    };
  }

  private setStatus(status: ExportJobStatus): void {
    this._status = status;
    if (FINISHED.has(status)) {
      this._finishedAt ??= Date.now();
    }
    this.changes.next();
    if (FINISHED.has(status) && status !== 'expired') {
      this.changes.complete();
    }
  }
}
