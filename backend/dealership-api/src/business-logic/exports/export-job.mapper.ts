import { translateMessage } from "#i18n/messages";
import type { ExportJobResponseDto } from "#dto/exports/export-job-response.dto";
import type { ExportJobRow } from "#persistence/schema/export-jobs";
import { toIsoString } from "#business-logic-abstractions/time/to-iso-string";
import { signedDownloadPath } from "./download-link";

/**
 * Why a job stopped, in the reader's language: the worker stores a catalog key (`exports.failure.tooLong`), since it
 * runs outside any request. A job stored before that kept its English text, shown as it is.
 */
function storedError(error: string): string {
  return error.startsWith("exports.failure.") ? translateMessage(error) : error;
}

/** Under this much writing time the rate is noise (a few rows in a few milliseconds), so none is shown yet. */
const MIN_MS_FOR_RATE = 500;

/**
 * An export job as the client sees it, at `now`: its state, how far it has got, the rate, the estimate, the link.
 * `queuePosition` is its place in line, worked out by the queue while it waits; null otherwise.
 */
export function toExportJobResponseDto(
  job: ExportJobRow,
  queuePosition: number | null,
  now: Temporal.Instant,
  linkKey: string,
): ExportJobResponseDto {
  const nowMs = now.epochMilliseconds;
  const writingMs = job.firstRowAt === null ? 0 : nowMs - job.firstRowAt.epochMilliseconds;
  const rowsPerSecond = writingMs > MIN_MS_FOR_RATE ? Math.round((job.rows / writingMs) * 1000) : null;
  const remaining = job.totalRows === null ? null : job.totalRows - job.rows;
  const expiresAt = job.expiresAt;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    rows: job.rows,
    totalRows: job.totalRows,
    rowsPerSecond,
    // Stops when the export finishes, so a finished one reports how long it took, however late it is asked.
    elapsedMs: Math.max(0, (job.finishedAt?.epochMilliseconds ?? nowMs) - job.createdAt.epochMilliseconds),
    etaMs:
      job.status === "writing" && remaining !== null && rowsPerSecond
        ? Math.round((remaining / rowsPerSecond) * 1000)
        : null,
    queuePosition: job.status === "queued" ? queuePosition : null,
    fileName: job.fileName,
    fileBytes: job.fileBytes,
    downloadPath:
      job.status === "completed" && expiresAt !== null
        ? signedDownloadPath(linkKey, job.id, expiresAt.epochMilliseconds)
        : null,
    expiresAt: expiresAt === null ? null : toIsoString(expiresAt),
    error: job.error === null ? null : storedError(job.error),
  };
}
