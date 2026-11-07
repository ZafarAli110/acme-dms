import { ApiError, RequestTimeoutError, ServerUnreachableError } from "../config/apiErrors";
import { apiClient } from "../services/apiClient";
import { session } from "../storage/sessionStore";

function delayAsync(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

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
  /**
   * How the card hears from the service: `following` its events; `reconnecting` after they stopped (a dropped
   * connection, a sleeping laptop, a stream that ended early); `stalled` after too many tries, until the user retries;
   * `lost` when the service no longer has the export.
   */
  connection: ExportConnection;
}

export type ExportConnection = "following" | "reconnecting" | "stalled" | "lost";

const FINISHED: ReadonlySet<ExportStatus> = new Set(["completed", "failed", "cancelled", "expired"]);

/** The service sends the export's state about once a second; this long without one, the card reconnects. */
const SILENCE_MS = 15_000;
/** Tries to reconnect, waiting 1, 2, 4, 8 and 16 seconds, before the card is stalled and waits for the user. */
const MAX_RECONNECTS = 5;

/** Whether a finished export's download link has run out, by this browser's clock (`expiresAt` is the service's). */
export function isLinkExpired(job: ExportJob, nowMs: number): boolean {
  return job.status === "completed" && job.expiresAt !== null && nowMs >= Date.parse(job.expiresAt);
}

/** Whether the export is still on its way: waiting, counting or writing, and the service still has it. */
export function isRunning(entry: ExportEntry): boolean {
  return !FINISHED.has(entry.job.status) && entry.connection !== "lost";
}

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
   * Starts an export and follows it. One idempotency key per press of the button, sent again when the first try got
   * no answer (it timed out, or never reached the service): the service may have started the export already, and
   * the same key gets that one back, never a second.
   */
  public async startAsync(title: string, serviceUrl: string, path: string, body: unknown): Promise<void> {
    const locationId = this.selectedLocationId();
    const options = { headers: { "idempotency-key": crypto.randomUUID() }, locationId };
    let job: ExportJob;
    try {
      job = await apiClient.postAsync<ExportJob>(`${serviceUrl}/${path}`, body, options);
    } catch (error) {
      if (!(error instanceof RequestTimeoutError || error instanceof ServerUnreachableError)) {
        throw error;
      }
      job = await apiClient.postAsync<ExportJob>(`${serviceUrl}/${path}`, body, options);
    }
    this.put({
      title,
      serviceUrl,
      job,
      receivedAt: performance.now(),
      problem: null,
      restored: false,
      locationId,
      connection: "following",
    });
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
        connection: "following",
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

  /** Follows a stalled export again, at the user's request. */
  public retry(jobId: string): void {
    const entry = this.find(jobId);
    if (entry && entry.connection === "stalled") {
      this.update(jobId, { connection: "reconnecting", problem: null });
      void this.followAsync(jobId);
    }
  }

  /** Takes a finished export off the panel; one still running is cancelled first. */
  public dismiss(jobId: string): void {
    const entry = this.find(jobId);
    if (entry && isRunning(entry)) {
      void this.cancelAsync(jobId);
    }
    this._following.get(jobId)?.abort();
    this._following.delete(jobId);
    this.commit(this._snapshot.filter((candidate) => candidate.job.id !== jobId));
  }

  /**
   * Follows the export's events until it finishes. When they stop without a final state (the stream dropped or
   * ended, or nothing came for SILENCE_MS), it reads the export's state and reconnects, waiting longer each time; after
   * MAX_RECONNECTS the card is stalled until the user retries. One follower per export: a second call stops the first.
   */
  private async followAsync(jobId: string): Promise<void> {
    const start = this.find(jobId);
    if (!start) {
      return;
    }
    this._following.get(jobId)?.abort();
    const following = new AbortController();
    this._following.set(jobId, following);
    try {
      for (let tries = 0; ; tries++) {
        if (tries > 0) {
          if (tries > MAX_RECONNECTS) {
            this.update(jobId, { connection: "stalled" });
            return;
          }
          this.update(jobId, { connection: "reconnecting" });
          await delayAsync(1000 * 2 ** (tries - 1), following.signal);
          if (!(await this.refreshAsync(jobId, start.serviceUrl, start.locationId, following.signal))) {
            return;
          }
        }
        const heard = await this.readUntilQuietAsync(jobId, start.serviceUrl, start.locationId, following);
        // Events came, so the connection worked: a drop later starts the count again, never stalling a long export.
        if (heard) {
          tries = 0;
        }
        const entry = this.find(jobId);
        if (!entry || following.signal.aborted || FINISHED.has(entry.job.status)) {
          return;
        }
      }
    } catch (error) {
      if (!following.signal.aborted) {
        this.update(jobId, { problem: error instanceof Error ? error.message : String(error), connection: "stalled" });
      }
    } finally {
      if (this._following.get(jobId) === following) {
        this._following.delete(jobId);
      }
    }
  }

  /** Reads the events until the stream ends, fails, or stays quiet for SILENCE_MS; true when any event came. */
  private async readUntilQuietAsync(
    jobId: string,
    serviceUrl: string,
    locationId: string,
    following: AbortController,
  ): Promise<boolean> {
    let heard = false;
    const quiet = new AbortController();
    let watchdog = setTimeout(() => quiet.abort(), SILENCE_MS);
    try {
      await apiClient.readEventsAsync<ExportJob>(
        `${serviceUrl}/v1/exports/${jobId}/events`,
        (job) => {
          heard = true;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => quiet.abort(), SILENCE_MS);
          this.update(jobId, { job, receivedAt: performance.now(), problem: null, connection: "following" });
        },
        { signal: AbortSignal.any([following.signal, quiet.signal]), locationId },
      );
    } catch (error) {
      // Stopped on purpose, gone quiet or dropped: the caller reads the state and reconnects. A refusal is final.
      if (error instanceof ApiError && error.status === 404) {
        this.update(jobId, { connection: "lost" });
        following.abort();
      }
    } finally {
      clearTimeout(watchdog);
    }
    return heard;
  }

  /** The export's state now; false when it is gone (404) or finished, so there is nothing more to follow. */
  private async refreshAsync(
    jobId: string,
    serviceUrl: string,
    locationId: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      const job = await apiClient.getAsync<ExportJob>(`${serviceUrl}/v1/exports/${jobId}`, { signal, locationId });
      this.update(jobId, { job, receivedAt: performance.now(), problem: null, connection: "following" });
      return !FINISHED.has(job.status);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        this.update(jobId, { connection: "lost" });
        return false;
      }
      // Still unreachable: the next try waits longer.
      return !signal.aborted;
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
