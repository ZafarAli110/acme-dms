import { translateMessage } from "#i18n/messages";
import type { ExportJobResponseDto } from "#dto/exports/export-job-response.dto";
import { signedDownloadPath } from "./download-link";
import type { ExportJob } from "./export-job";

/**
 * Why a job stopped, in the reader's language: the runner stores a catalog key (`exports.failure.failed`). Any other
 * text (a reason the service gave while stopping) is shown as it is.
 */
function storedError(error: string): string {
  return error.startsWith("exports.failure.") ? translateMessage(error) : error;
}

/** Under this much writing time the rate is noise (a few rows in a few milliseconds), so none is shown yet. */
const MIN_MS_FOR_RATE = 500;

/** An export job as the client sees it, at `nowMs`: its state, how far it has got, the rate, the estimate, the link. */
export function toExportJobResponseDto(job: ExportJob, nowMs: number = Date.now()): ExportJobResponseDto {
  const writingMs = job.firstRowAt === null ? 0 : nowMs - job.firstRowAt;
  const rowsPerSecond = writingMs > MIN_MS_FOR_RATE ? Math.round((job.rows / writingMs) * 1000) : null;
  const remaining = job.totalRows === null ? null : job.totalRows - job.rows;
  const expiresAt = job.expiresAt;
  return {
    id: job.id,
    status: job.status,
    rows: job.rows,
    totalRows: job.totalRows,
    rowsPerSecond,
    // Stops when the export finishes, so a finished one reports how long it took, however late it is asked.
    elapsedMs: (job.finishedAt ?? nowMs) - job.createdAt,
    etaMs:
      job.status === "writing" && remaining !== null && rowsPerSecond
        ? Math.round((remaining / rowsPerSecond) * 1000)
        : null,
    queuePosition: job.status === "queued" ? job.queuePosition : null,
    fileName: job.source.fileName,
    fileBytes: job.fileBytes,
    downloadPath: job.status === "completed" && expiresAt !== null ? signedDownloadPath(job.id, expiresAt) : null,
    expiresAt: expiresAt === null ? null : Temporal.Instant.fromEpochMilliseconds(expiresAt).toString(),
    error: job.error === null ? null : storedError(job.error),
  };
}
