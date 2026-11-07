import { apiClient } from "../services/apiClient";
import { session } from "../storage/sessionStore";

/** Which list an export is of. */
export type ExportKind = "customers";

export type ExportStatus = "queued" | "counting" | "writing" | "completed" | "failed" | "cancelled" | "expired";

/** An export as dealership-api reports it (ExportJobResponseDto). */
export interface ExportJob {
  id: string;
  kind: ExportKind;
  status: ExportStatus;
  rows: number;
  totalRows: number | null;
  rowsPerSecond: number | null;
  elapsedMs: number;
  etaMs: number | null;
  queuePosition: number | null;
  fileName: string;
  fileBytes: number | null;
  /** Relative to the service; a signed link, so the browser can save the file without the bearer token. */
  downloadPath: string | null;
  expiresAt: string | null;
  error: string | null;
}

/** One export the user started, with what it is of and where its service is. */
export interface ExportEntry {
  title: string;
  serviceUrl: string;
  job: ExportJob;
  /** When the latest state arrived (performance.now()), so a timer can run on between updates. */
  receivedAt: number;
  /** A failure to start or to follow it (the network), not the export's own failure. */
  problem: string | null;
  /** Put back from the service (after a reload), not started in this tab just now. */
  restored: boolean;
  /** The location it was started at: it is followed and cancelled there, and shown only while that one is selected. */
  locationId: string;
}

const FINISHED: ReadonlySet<ExportStatus> = new Set(["completed", "failed", "cancelled", "expired"]);

/**
 * The user's exports, outside React, so one keeps running and reporting while the user works on other pages. Each is
 * followed through its server-sent events until it finishes. The exports run on the server, so a reload loses none:
 * `restoreAsync` puts them back. React reads it through `useExports()`; the exports button in the top bar shows it.
 */
export class ExportKernel {
  private _snapshot: ExportEntry[] = [];
  private readonly _listeners = new Set<() => void>();
  private readonly _following = new Map<string, AbortController>();

  public getSnapshot(): ExportEntry[] {
    return this._snapshot;
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Starts an export and follows it. One idempotency key per press of the button: a retry of the same press gets the
   * same export, never a second one.
   */
  public async startAsync(title: string, serviceUrl: string, path: string, body: unknown): Promise<void> {
    const locationId = this.selectedLocationId();
    const job = await apiClient.postAsync<ExportJob>(`${serviceUrl}/${path}`, body, {
      headers: { "idempotency-key": crypto.randomUUID() },
      locationId,
    });
    this.put({ title, serviceUrl, job, receivedAt: performance.now(), problem: null, restored: false, locationId });
    void this.followAsync(job.id);
  }

  /**
   * Puts back the user's exports at the selected location that the service still has (after a reload, or a location
   * switch), and follows the ones still running. Ones already on the panel are left as they are; cancelled ones are
   * not brought back, since the user chose to drop them.
   */
  public async restoreAsync(serviceUrl: string, titleOf: (job: ExportJob) => string): Promise<void> {
    const locationId = this.selectedLocationId();
    const jobs = await apiClient.getAsync<ExportJob[]>(`${serviceUrl}/v1/exports`, { locationId });
    // The service lists the newest first; the panel shows them in the order they were started.
    for (const job of jobs.toReversed()) {
      if (this.find(job.id) || job.status === "cancelled") {
        continue;
      }
      this.put({
        title: titleOf(job),
        serviceUrl,
        job,
        receivedAt: performance.now(),
        problem: null,
        restored: true,
        locationId,
      });
      if (!FINISHED.has(job.status)) {
        void this.followAsync(job.id);
      }
    }
  }

  public async cancelAsync(jobId: string): Promise<void> {
    const entry = this.find(jobId);
    if (entry) {
      await apiClient.deleteAsync(`${entry.serviceUrl}/v1/exports/${jobId}`, { locationId: entry.locationId });
    }
  }

  /**
   * Forgets every export: the sign-in ended or changed, and the cards (and their download links) were the previous
   * user's. The next user's are put back from the service by `restoreAsync`.
   */
  public reset(): void {
    for (const following of this._following.values()) {
      following.abort();
    }
    this._following.clear();
    this.commit([]);
  }

  /** Takes a finished export off the panel; one still running is cancelled first. */
  public dismiss(jobId: string): void {
    const entry = this.find(jobId);
    if (entry && !FINISHED.has(entry.job.status)) {
      void this.cancelAsync(jobId);
    }
    this._following.get(jobId)?.abort();
    this._following.delete(jobId);
    this.commit(this._snapshot.filter((candidate) => candidate.job.id !== jobId));
  }

  private async followAsync(jobId: string): Promise<void> {
    const entry = this.find(jobId);
    if (!entry) {
      return;
    }
    const following = new AbortController();
    this._following.set(jobId, following);
    try {
      await apiClient.readEventsAsync<ExportJob>(
        `${entry.serviceUrl}/v1/exports/${jobId}/events`,
        (job) => this.update(jobId, { job, receivedAt: performance.now(), problem: null }),
        { signal: following.signal, locationId: entry.locationId },
      );
    } catch (error) {
      if (!following.signal.aborted) {
        this.update(jobId, { problem: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this._following.delete(jobId);
    }
  }

  private selectedLocationId(): string {
    const locationId = session.getLocationId();
    if (locationId === null) {
      throw new Error("No location is selected.");
    }
    return locationId;
  }

  private find(jobId: string): ExportEntry | null {
    return this._snapshot.find((entry) => entry.job.id === jobId) ?? null;
  }

  private put(entry: ExportEntry): void {
    this.commit([...this._snapshot.filter((candidate) => candidate.job.id !== entry.job.id), entry]);
  }

  private update(jobId: string, changes: Partial<ExportEntry>): void {
    this.commit(this._snapshot.map((entry) => (entry.job.id === jobId ? { ...entry, ...changes } : entry)));
  }

  private commit(snapshot: ExportEntry[]): void {
    this._snapshot = snapshot;
    for (const listener of this._listeners) {
      listener();
    }
  }
}

export const exportKernel = new ExportKernel();
