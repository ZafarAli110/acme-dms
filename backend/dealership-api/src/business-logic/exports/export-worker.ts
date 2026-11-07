import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout as delayAsync } from "node:timers/promises";
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull, lt, type SQL, sql } from "drizzle-orm";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import { type ExportJobRow, exportJobs } from "#persistence/schema/export-jobs";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { SETTINGS, type Settings } from "#settings/settings";
import { RUNNING_STATUSES } from "./export-queue";
import type { ExportSource } from "./export-source";
import { EXPORT_SOURCES } from "./export-sources";
import { type XlsxRow, XlsxWorkbookWriter } from "./xlsx/xlsx-workbook-writer";

// The tunable limits come from the settings (src/settings/settings.ts):
//   EXPORT_MAX_RUNNING                exports this worker runs at once. Each holds a database connection while it
//                                     reads, plus a short one each second for its progress.
//   EXPORT_MAX_RUNNING_PER_DEALER     exports one dealer may have running across all workers, so a dealer exporting
//                                     a lot cannot keep every other dealer waiting.
//   EXPORT_POLL_MS                    how often this worker looks for waiting exports.
//   EXPORT_STATEMENT_TIMEOUT_SECONDS  how long one of an export's SQL statements may run (the request limit,
//                                     DATABASE_STATEMENT_TIMEOUT, is far too short for a big customer book).
//   EXPORT_MAX_SECONDS                how long a whole export may run before it is stopped and failed.
//   EXPORT_STALE_SECONDS              after how long without a heartbeat a running export counts as abandoned.
//   EXPORT_TTL_SECONDS                how long a finished file can be downloaded.
//   EXPORT_BATCH_SIZE                 rows per round trip (default 20,000). Measured with 40 ms between the service
//                                     and Postgres, 1.6 million rows: 5,000 a fetch took 20.1 s (334 round trips),
//                                     50,000 took 7.8 s, at about 170 MB more memory.

/** A job's record outlives its file this many times over, so a late retry with its idempotency key still finds it. */
const RECORD_TTL_FACTOR = 4;
/** How often a running export writes its progress and heartbeat, and looks for a cancel: the user sees it move. */
const PROGRESS_MS = 1000;
/** How often the sweeper looks for abandoned, expired and old jobs: well inside EXPORT_STALE_SECONDS. */
const SWEEP_MS = 15_000;
/** An export abandoned by its worker this many times is failed, not tried again: it is probably what kills workers. */
const MAX_ATTEMPTS = 2;

/** Why a running export stopped before its file was done, other than an error. */
type StopReason = "cancelled" | "lost";

/** A running export stopped on purpose: the user cancelled it, or this worker no longer holds it (it was swept). */
class ExportStoppedError extends Error {
  public readonly reason: StopReason;

  public constructor(reason: StopReason) {
    // The cancelled one is stored on the job as its catalog key, and translated when the job is read.
    super(reason === "cancelled" ? "exports.failure.cancelledByUser" : "This worker no longer holds the export.");
    this.name = "ExportStoppedError";
    this.reason = reason;
  }
}

/** What a running export has done so far, written to its row about once a second. */
interface ExportProgress {
  rows: number;
  firstRowAt: Temporal.Instant | null;
}

/**
 * Runs exports: a process of its own (service/worker.ts), never the API. Every EXPORT_POLL_MS it claims waiting jobs
 * from `export_jobs`, up to its free slots, and for each one counts and streams the rows in one snapshot into an
 * .xlsx (a temp file, renamed when complete), writing progress and a heartbeat to the row about once a second. Any
 * number of workers can run side by side: claiming uses FOR UPDATE SKIP LOCKED, so each waiting job goes to one.
 * A worker serves every dealer, so its own queries of export_jobs are not filtered by one; each row carries its dealer
 * and location, and the export's queries (its ExportSource) filter by them.
 *
 * A sweeper in every worker takes back jobs whose worker stopped (no heartbeat for EXPORT_STALE_SECONDS), expires
 * finished files and deletes old rows. It needs no distributed lock: each of its statements is one conditional UPDATE
 * or DELETE, and Postgres lets only one worker change a given row, so two sweepers at once do the same work once. A
 * job that must run on exactly one instance (a nightly report, say) is what @nestjs/locks (the official package,
 * v0.0.5) is for; this is not one.
 */
@Injectable()
export class ExportWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;
  private readonly _settings: Settings;
  private readonly _logger = new Logger(ExportWorker.name);
  /** Names this process in the rows it holds: the host, the process and a random part for a restarted one. */
  private readonly _workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private readonly _running = new Map<string, Promise<void>>();
  private _claiming = false;
  private _stopping = false;
  private _poller: NodeJS.Timeout | null = null;
  private _sweeper: NodeJS.Timeout | null = null;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
    @Inject(SETTINGS) settings: Settings,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
    this._settings = settings;
  }

  public async onApplicationBootstrap(): Promise<void> {
    await mkdir(this._settings.exportDirectory, { recursive: true });
    this._poller = setInterval(() => void this.claimAsync(), this._settings.exportPollMs);
    this._sweeper = setInterval(() => void this.sweepAsync(), SWEEP_MS);
    this._logger.log(`Export worker ${this._workerId} is taking exports (up to ${this._settings.exportMaxRunning}).`);
  }

  /**
   * Stops claiming, then lets the running exports finish. If the process is killed first, the sweeper of another
   * worker (or of this one, restarted) gives them back to the line once their heartbeat is stale.
   */
  public async beforeApplicationShutdown(): Promise<void> {
    this._stopping = true;
    for (const timer of [this._poller, this._sweeper]) {
      if (timer) {
        clearInterval(timer);
      }
    }
    if (this._running.size > 0) {
      this._logger.log(`Waiting for ${this._running.size} running exports to finish before stopping.`);
    }
    await Promise.allSettled(this._running.values());
  }

  /** For tests: claims and runs exports until none is waiting that this worker may take, and none is running. */
  public async runUntilIdleAsync(): Promise<void> {
    await mkdir(this._settings.exportDirectory, { recursive: true });
    for (;;) {
      const claimed = await this.claimAsync();
      if (claimed.length === 0 && this._running.size === 0) {
        return;
      }
      await Promise.race(this._running.values());
    }
  }

  /**
   * Claims waiting exports for this worker's free slots, in one statement, and starts them. Returns their ids.
   *
   * Fair across dealers: each waiting job is ranked by how many its dealer already has running plus its place in its
   * dealer's line, so dealers take turns (A's first, B's first, A's second, ...) and a dealer at
   * EXPORT_MAX_RUNNING_PER_DEALER waits. Waiting rows are locked with SKIP LOCKED, so two workers never claim one job.
   * Two workers claiming at the same instant each count the other's new jobs as not yet running, so a dealer can
   * briefly go over its limit by a job or two. If that mattered, a per-dealer advisory lock
   * (pg_advisory_xact_lock(hashtextextended(dealer_id::text, 0))) taken before counting would serialise claims per dealer.
   */
  public async claimAsync(): Promise<string[]> {
    const free = this._settings.exportMaxRunning - this._running.size;
    if (this._stopping || this._claiming || free <= 0) {
      return [];
    }
    this._claiming = true;
    try {
      const now = this._clock.now().toString();
      await using work = await this._unitOfWorkFactory.beginAsync();
      const claimed = await work.db.execute<{ id: string; attempts: number }>(sql`
        with queued as materialized (
          select id, dealer_id, created_at from export_jobs
          where status = 'queued'
          for update skip locked
        ),
        running as (
          select dealer_id, count(*) as running from export_jobs
          where status in ('counting', 'writing')
          group by dealer_id
        ),
        ranked as (
          select q.id, q.created_at,
            coalesce(r.running, 0) + row_number() over (partition by q.dealer_id order by q.created_at, q.id) as turn
          from queued q left join running r on r.dealer_id = q.dealer_id
        ),
        picked as (
          select id from ranked
          where turn <= ${this._settings.exportMaxRunningPerDealer}
          order by turn, created_at, id
          limit ${free}
        )
        update export_jobs
        set status = 'counting', worker_id = ${this._workerId}, attempts = export_jobs.attempts + 1,
          started_at = coalesce(export_jobs.started_at, ${now}::timestamptz), heartbeat_at = ${now}::timestamptz
        from picked
        where export_jobs.id = picked.id
        returning export_jobs.id, export_jobs.attempts`);
      await work.commitAsync();
      for (const { id, attempts } of claimed.rows) {
        // Keyed by the attempt: a job this worker claims again after a sweep runs beside the old attempt, which can
        // then neither overwrite nor remove the new one's entry.
        const key = `${id}:${attempts}`;
        this._running.set(
          key,
          this.runAsync(id, attempts).finally(() => this._running.delete(key)),
        );
      }
      return claimed.rows.map((row) => row.id);
    } catch (error) {
      this._logger.error(`Claiming exports failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally {
      this._claiming = false;
    }
  }

  /**
   * Takes back running jobs whose worker went quiet: once more to the front of the line (their place is kept), then
   * failed; a cancel asked for meanwhile is honoured. Expires finished files, and deletes rows long past their file.
   * Every statement is conditional on the row's state, so sweepers in several workers never undo each other.
   */
  public async sweepAsync(): Promise<void> {
    try {
      const now = this._clock.now();
      const staleBefore = now.subtract({ seconds: this._settings.exportStaleSeconds });
      const stale = and(inArray(exportJobs.status, RUNNING_STATUSES), lt(exportJobs.heartbeatAt, staleBefore));
      await using work = await this._unitOfWorkFactory.beginAsync();
      const done = { id: exportJobs.id, attempts: exportJobs.attempts };

      const cancelled = await work.db
        .update(exportJobs)
        .set({ status: "cancelled", error: "exports.failure.cancelledByUser", finishedAt: now })
        .where(and(stale, isNotNull(exportJobs.cancelRequestedAt)))
        .returning(done);
      const requeued = await work.db
        .update(exportJobs)
        .set({ status: "queued", rows: 0, totalRows: null, firstRowAt: null, workerId: null, heartbeatAt: null })
        .where(and(stale, lt(exportJobs.attempts, MAX_ATTEMPTS)))
        .returning(done);
      const failed = await work.db
        .update(exportJobs)
        .set({ status: "failed", error: "exports.failure.stoppedResponding", finishedAt: now })
        .where(stale)
        .returning(done);
      // The path each file had: RETURNING gives the new value (null), so it is read before the update.
      const expired = await work.db.execute<{ file_path: string | null }>(sql`
        with old as (
          select id, file_path from export_jobs
          where status = 'completed' and expires_at < ${now.toString()}::timestamptz
          for update
        )
        update export_jobs set status = 'expired', file_path = null
        from old where export_jobs.id = old.id
        returning old.file_path`);
      const recordsBefore = now.subtract({ milliseconds: this._settings.exportFileTtlMs * RECORD_TTL_FACTOR });
      await work.db
        .delete(exportJobs)
        .where(
          and(inArray(exportJobs.status, ["failed", "cancelled", "expired"]), lt(exportJobs.finishedAt, recordsBefore)),
        );
      await work.commitAsync();

      for (const job of [...cancelled, ...requeued, ...failed]) {
        await rm(this.partPath(job.id, job.attempts), { force: true });
      }
      for (const { file_path: filePath } of expired.rows) {
        if (filePath !== null) {
          await rm(filePath, { force: true });
        }
      }
      await this.removeOrphanFilesAsync(now);
      if (requeued.length + failed.length > 0) {
        this._logger.warn(`Took back abandoned exports: ${requeued.length} requeued, ${failed.length} failed.`);
      }
    } catch (error) {
      this._logger.error(`Sweeping exports failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Removes files no job points at: a completed file nobody recorded (the worker stopped between writing it and
   * completing the job), or a temp file of an attempt that ended without cleaning up. Only files older than
   * EXPORT_STALE_SECONDS: a running attempt's file is always recent or recorded.
   */
  private async removeOrphanFilesAsync(now: Temporal.Instant): Promise<void> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const jobs = await work.db
      .select({
        id: exportJobs.id,
        status: exportJobs.status,
        attempts: exportJobs.attempts,
        filePath: exportJobs.filePath,
      })
      .from(exportJobs)
      .where(inArray(exportJobs.status, [...RUNNING_STATUSES, "completed"]));
    const kept = new Set<string>();
    for (const job of jobs) {
      if (job.filePath !== null) {
        kept.add(job.filePath);
      }
      if (job.status !== "completed") {
        kept.add(this.partPath(job.id, job.attempts));
        kept.add(this.filePath(job.id, job.attempts));
      }
    }
    const oldBefore = now.epochMilliseconds - this._settings.exportStaleSeconds * 1000;
    for (const name of await readdir(this._settings.exportDirectory)) {
      const path = join(this._settings.exportDirectory, name);
      if (!kept.has(path) && /\.xlsx(\.part)?$/.test(name) && (await stat(path)).mtimeMs < oldBefore) {
        await rm(path, { force: true });
      }
    }
  }

  /** Runs one claimed export to its end. Never rejects: whatever goes wrong is recorded on the job, or logged. */
  private async runAsync(jobId: string, attempt: number): Promise<void> {
    try {
      await this.runJobAsync(jobId, attempt);
    } catch (error) {
      // Only reached when the database is out of reach; the sweeper takes the job back once its heartbeat is stale.
      this._logger.error(`Export ${jobId} could not run: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async runJobAsync(jobId: string, attempt: number): Promise<void> {
    const [job] = await this.readJobAsync(jobId, attempt);
    if (!job) {
      return;
    }
    const partPath = this.partPath(job.id, job.attempts);
    const progress: ExportProgress = { rows: 0, firstRowAt: null };
    const stop = new AbortController();
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(this._settings.exportMaxSeconds * 1000)]);
    const reporting = new AbortController();
    const reported = this.reportProgressAsync(job.id, job.attempts, progress, stop, reporting.signal);
    try {
      const source = EXPORT_SOURCES[job.kind](
        { dealerId: job.dealerId, locationId: job.locationId },
        job.request,
        job.createdAt,
      );
      await this.writeFileAsync(job, source, partPath, progress, signal);
      reporting.abort();
      await reported;
      // This attempt's own name: renamed first, then recorded, so a completed job always has its file. An attempt
      // that lost the job removes only its own file, never the one another attempt completed.
      const filePath = this.filePath(job.id, job.attempts);
      await rename(partPath, filePath);
      if (!(await this.completeAsync(job, progress, filePath))) {
        // Cancelled at the last moment, or taken back by a sweeper: the file is nobody's.
        await rm(filePath, { force: true });
        await this.finishAsync(job.id, job.attempts, "cancelled", "exports.failure.cancelledByUser");
      }
    } catch (error) {
      reporting.abort();
      await reported;
      await rm(partPath, { force: true });
      await this.failAsync(job.id, job.attempts, error, signal);
    }
  }

  /** Counts and streams the rows in one read-only snapshot into the temp file; stops when `signal` aborts. */
  private async writeFileAsync(
    job: ExportJobRow,
    source: ExportSource,
    partPath: string,
    progress: ExportProgress,
    signal: AbortSignal,
  ): Promise<void> {
    const writer = new XlsxWorkbookWriter(source.sheetName, source.columns);
    try {
      await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
      // One snapshot for the count and the rows, so the total the user sees is the number of rows in the file.
      await work.db.execute(sql`set transaction isolation level repeatable read`);
      // A whole number of seconds from the settings: SET takes no parameters, and nothing else reaches this text.
      await work.db.execute(
        sql.raw(`set local statement_timeout = '${this._settings.exportStatementTimeoutSeconds}s'`),
      );
      // A cancel or the time limit stops a long count too: Postgres cancels the statement this connection is running,
      // instead of the export waiting out its statement timeout.
      const [backend] = (await work.db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows;
      const cancelCount = (): void => void this.cancelStatementAsync(backend!.pid);
      signal.addEventListener("abort", cancelCount, { once: true });
      let total: number;
      try {
        total = await source.countAsync(work.db);
      } finally {
        signal.removeEventListener("abort", cancelCount);
      }
      signal.throwIfAborted();
      await this.startWritingAsync(job.id, job.attempts, total);

      const rows = work.stream(source.rowsQuery(work.db), this._settings.exportBatchSize);
      const destroy = (): void => {
        rows.destroy(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
      };
      signal.throwIfAborted();
      signal.addEventListener("abort", destroy, { once: true });
      const written = pipeline(writer.output, createWriteStream(partPath));
      // Awaited below once the rows are in; when the export stops early, the caller's cleanup handles it instead.
      written.catch(() => {});
      for await (const row of rows as AsyncIterable<XlsxRow>) {
        await writer.writeRowAsync(row);
        progress.rows++;
        progress.firstRowAt ??= this._clock.now();
      }
      signal.removeEventListener("abort", destroy);
      await writer.finishAsync();
      await written;
    } catch (error) {
      // Destroyed without an error on purpose: an 'error' event nobody listens for ends the whole process.
      writer.abort();
      throw error;
    }
  }

  /** Cancels what the given connection is running, from another connection. Best effort: the export stops either way. */
  private async cancelStatementAsync(pid: number): Promise<void> {
    try {
      await using work = await this._unitOfWorkFactory.beginAsync();
      await work.db.execute(sql`select pg_cancel_backend(${pid})`);
      await work.commitAsync();
    } catch (error) {
      this._logger.warn(
        `Could not cancel an export's count: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * About once a second while the export runs: writes the rows so far and the heartbeat, and reads whether the user
   * asked to cancel. A row this worker no longer holds (a sweeper took it back) stops the export too.
   */
  private async reportProgressAsync(
    jobId: string,
    attempt: number,
    progress: ExportProgress,
    stop: AbortController,
    done: AbortSignal,
  ): Promise<void> {
    while (!done.aborted) {
      try {
        await delayAsync(PROGRESS_MS, null, { signal: done });
      } catch {
        return;
      }
      try {
        const [row] = await this.updateHeldAsync(jobId, attempt, {
          rows: progress.rows,
          firstRowAt: progress.firstRowAt,
          heartbeatAt: this._clock.now(),
        });
        if (!row) {
          stop.abort(new ExportStoppedError("lost"));
          return;
        }
        if (row.cancelRequestedAt !== null) {
          stop.abort(new ExportStoppedError("cancelled"));
          return;
        }
      } catch (error) {
        // A missed beat is not fatal: the next one may get through, and the sweeper waits EXPORT_STALE_SECONDS.
        this._logger.warn(`Export ${jobId}: progress not saved: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async startWritingAsync(jobId: string, attempt: number, totalRows: number): Promise<void> {
    const [row] = await this.updateHeldAsync(jobId, attempt, {
      status: "writing",
      totalRows,
      heartbeatAt: this._clock.now(),
    });
    if (!row) {
      throw new ExportStoppedError("lost");
    }
    if (row.cancelRequestedAt !== null) {
      throw new ExportStoppedError("cancelled");
    }
  }

  /** Completes the job, unless the user cancelled it meanwhile or this worker no longer holds it. */
  private async completeAsync(job: ExportJobRow, progress: ExportProgress, filePath: string): Promise<boolean> {
    const now = this._clock.now();
    const fileBytes = (await stat(filePath)).size;
    await using work = await this._unitOfWorkFactory.beginAsync();
    const completed = await work.db
      .update(exportJobs)
      .set({
        status: "completed",
        rows: progress.rows,
        firstRowAt: progress.firstRowAt,
        filePath,
        fileBytes,
        heartbeatAt: now,
        finishedAt: now,
        expiresAt: now.add({ milliseconds: this._settings.exportFileTtlMs }),
      })
      .where(and(this.heldWhere(job.id, job.attempts), isNull(exportJobs.cancelRequestedAt)))
      .returning({ id: exportJobs.id });
    await work.commitAsync();
    return completed.length > 0;
  }

  /** Records why a running export stopped: cancelled, too slow, or failed. A job this worker lost is left alone. */
  private async failAsync(jobId: string, attempt: number, error: unknown, signal: AbortSignal): Promise<void> {
    const reason: unknown = signal.aborted ? signal.reason : error;
    if (reason instanceof ExportStoppedError) {
      if (reason.reason === "cancelled") {
        await this.finishAsync(jobId, attempt, "cancelled", reason.message);
      }
      return;
    }
    if (isTimeout(reason) || isTimeout(error)) {
      await this.finishAsync(jobId, attempt, "failed", "exports.failure.tooLong");
      return;
    }
    this._logger.error(`Export ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`);
    await this.finishAsync(jobId, attempt, "failed", "exports.failure.failed");
  }

  private async finishAsync(
    jobId: string,
    attempt: number,
    status: "failed" | "cancelled",
    error: string,
  ): Promise<void> {
    try {
      await this.updateHeldAsync(jobId, attempt, { status, error, finishedAt: this._clock.now() });
    } catch (updateError) {
      // The sweeper finishes it once its heartbeat is stale.
      this._logger.error(`Export ${jobId}: could not record that it stopped: ${String(updateError)}`);
    }
  }

  /** Updates a job this worker still holds (claimed by it and still running); returns nothing if it no longer does. */
  private async updateHeldAsync(
    jobId: string,
    attempt: number,
    changes: Partial<ExportJobRow>,
  ): Promise<{ cancelRequestedAt: Temporal.Instant | null }[]> {
    await using work = await this._unitOfWorkFactory.beginAsync();
    const updated = await work.db
      .update(exportJobs)
      .set(changes)
      .where(this.heldWhere(jobId, attempt))
      .returning({ cancelRequestedAt: exportJobs.cancelRequestedAt });
    await work.commitAsync();
    return updated;
  }

  private async readJobAsync(jobId: string, attempt: number): Promise<ExportJobRow[]> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    return work.db.select().from(exportJobs).where(this.heldWhere(jobId, attempt));
  }

  /**
   * The job, if this worker holds it in this attempt. The worker's queries filter by the job's id, this worker and the
   * attempt, not by a dealer: it serves every dealer, and each row carries its dealer and location, which the export's
   * own queries filter by. The attempt matters when this worker was swept and claimed the job again: the old attempt's
   * writes then match nothing.
   */
  private heldWhere(jobId: string, attempt: number): SQL | undefined {
    return and(
      eq(exportJobs.id, jobId),
      eq(exportJobs.workerId, this._workerId),
      eq(exportJobs.attempts, attempt),
      inArray(exportJobs.status, RUNNING_STATUSES),
    );
  }

  /**
   * A finished export's file, one per attempt, recorded in file_path. The API serves it from there, so both processes
   * must use the same EXPORT_DIR.
   */
  private filePath(jobId: string, attempt: number): string {
    return join(this._settings.exportDirectory, `${jobId}-${attempt}.xlsx`);
  }

  /** The temp file of one attempt: a second attempt never writes over, or deletes, the file of a first still running. */
  private partPath(jobId: string, attempt: number): string {
    return join(this._settings.exportDirectory, `${jobId}-${attempt}.xlsx.part`);
  }
}

/** The export's own time limit (EXPORT_MAX_SECONDS), or Postgres cancelling a statement (statement_timeout, 57014). */
function isTimeout(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 3; depth++) {
    if ((current as Error & { code?: string }).code === "57014") {
      return true;
    }
    current = current.cause;
  }
  return false;
}
