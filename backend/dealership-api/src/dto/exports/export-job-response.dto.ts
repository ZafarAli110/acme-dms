export type ExportJobStatus = 'queued' | 'counting' | 'writing' | 'completed' | 'failed' | 'cancelled' | 'expired';

/** An export as the client follows it: enough for a progress bar, a throughput, a timer and an estimate. */
export interface ExportJobResponseDto {
  id: string;
  status: ExportJobStatus;
  /** Rows written so far. */
  rows: number;
  /** How many rows the file will hold, once counted; null before. */
  totalRows: number | null;
  rowsPerSecond: number | null;
  elapsedMs: number;
  /** Time left at the current rate, while writing; null otherwise. */
  etaMs: number | null;
  /** Its place in line while queued (1 is next); null otherwise. */
  queuePosition: number | null;
  fileName: string;
  fileBytes: number | null;
  /**
   * Where to download the finished file, relative to this service: a link signed for a short time, so the browser can
   * save it straight to disk without the bearer token. Null until completed.
   */
  downloadPath: string | null;
  /** When the file is deleted; null until completed. */
  expiresAt: string | null;
  error: string | null;
}
