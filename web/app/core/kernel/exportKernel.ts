import {apiClient} from '../services/apiClient';

export type ExportStatus = 'queued' | 'counting' | 'writing' | 'completed' | 'failed' | 'cancelled' | 'expired';

/** An export as dealership-api reports it (ExportJobResponseDto). */
export interface ExportJob {
  id: string;
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

/** One export the user started in this tab, with what it is of and where its service is. */
export interface ExportEntry {
  title: string;
  serviceUrl: string;
  job: ExportJob;
  /** When the latest state arrived (performance.now()), so a timer can run on between updates. */
  receivedAt: number;
  /** A failure to start or to follow it (the network), not the export's own failure. */
  problem: string | null;
}

const FINISHED: ReadonlySet<ExportStatus> = new Set(['completed', 'failed', 'cancelled', 'expired']);

/**
 * The exports this tab started, outside React, so one keeps running and reporting while the user works on other
 * pages. Each is followed through its server-sent events until it finishes. React reads it through `useExports()`;
 * the export panel in the layout shows it.
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
    const job = await apiClient.postAsync<ExportJob>(`${serviceUrl}/${path}`, body, {
      headers: {'idempotency-key': crypto.randomUUID()},
    });
    this.put({title, serviceUrl, job, receivedAt: performance.now(), problem: null});
    void this.followAsync(job.id);
  }

  public async cancelAsync(jobId: string): Promise<void> {
    const entry = this.find(jobId);
    if (entry) {
      await apiClient.deleteAsync(`${entry.serviceUrl}/v1/exports/${jobId}`);
    }
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
        (job) => this.update(jobId, {job, receivedAt: performance.now(), problem: null}),
        {signal: following.signal},
      );
    } catch (error) {
      if (!following.signal.aborted) {
        this.update(jobId, {problem: error instanceof Error ? error.message : String(error)});
      }
    } finally {
      this._following.delete(jobId);
    }
  }

  private find(jobId: string): ExportEntry | null {
    return this._snapshot.find((entry) => entry.job.id === jobId) ?? null;
  }

  private put(entry: ExportEntry): void {
    this.commit([...this._snapshot.filter((candidate) => candidate.job.id !== entry.job.id), entry]);
  }

  private update(jobId: string, changes: Partial<ExportEntry>): void {
    this.commit(this._snapshot.map((entry) => (entry.job.id === jobId ? {...entry, ...changes} : entry)));
  }

  private commit(snapshot: ExportEntry[]): void {
    this._snapshot = snapshot;
    for (const listener of this._listeners) {
      listener();
    }
  }
}

export const exportKernel = new ExportKernel();
