import type {Observable} from 'rxjs';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';

/** A finished export's file, for the download. */
export interface ExportFile {
  path: string;
  bytes: number;
  fileName: string;
}

/** The export jobs: following one, cancelling it, and the signed download of its file. Starting one is per list. */
export interface IExportJobs {
  get(userContext: UserContext, jobId: string): ExportJobResponseDto;
  /** Snapshots while it runs, at most a few a second plus a heartbeat; ends after the last state. */
  progress(userContext: UserContext, jobId: string): Observable<ExportJobResponseDto>;
  /** Cancels a queued or running export; for a finished one, deletes the file now. */
  cancelAsync(userContext: UserContext, jobId: string): Promise<void>;
  /** The file, when the link's signature and time are good; no user context: the link is the permission. */
  fileForLink(jobId: string, expires: string, signature: string): ExportFile;
}

export const EXPORT_JOBS = Symbol('IExportJobs');
