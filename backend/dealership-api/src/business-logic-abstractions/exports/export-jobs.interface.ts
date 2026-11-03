import type { Observable } from "rxjs";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ExportJobResponseDto } from "#dto/exports/export-job-response.dto";

/** A finished export's file, for the download. */
export interface ExportFile {
  path: string;
  bytes: number;
  fileName: string;
}

/**
 * The export jobs: following one, listing the user's, cancelling one, and the signed download of its file. Starting
 * one is per list (a start handler); an export worker, a process of its own, runs them.
 */
export interface IExportJobs {
  getAsync(userContext: UserContext, jobId: string): Promise<ExportJobResponseDto>;
  /** The user's exports at the selected location that have not expired, newest first: what a reloaded page shows. */
  listAsync(userContext: UserContext): Promise<ExportJobResponseDto[]>;
  /** Snapshots about once a second while it runs; ends after the last state. Someone else's export is a 404. */
  progressAsync(userContext: UserContext, jobId: string): Promise<Observable<ExportJobResponseDto>>;
  /** Cancels a queued or running export; for a finished one, deletes the file now. */
  cancelAsync(userContext: UserContext, jobId: string): Promise<void>;
  /** The file, when the link's signature and time are good; no user context: the link is the permission. */
  fileForLinkAsync(jobId: string, expires: string, signature: string): Promise<ExportFile>;
}

export const EXPORT_JOBS = Symbol("IExportJobs");
