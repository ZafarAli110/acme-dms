import {createWriteStream} from 'node:fs';
import {mkdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {interval, map, merge, type Observable, startWith, takeWhile} from 'rxjs';
import type {ExportFile, IExportJobs} from '#business-logic-abstractions/exports/export-jobs.interface';
import {CLOCK, type IClock} from '#business-logic-abstractions/time/clock.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import {type IUnitOfWorkFactory, UNIT_OF_WORK_FACTORY} from '#persistence/unit-of-work/unit-of-work.factory.interface';
import {requireLocation} from '../user-context/require-location';
import {isValidDownloadLink} from './download-link';
import {ExportJob} from './export-job';
import type {ExportSource} from './export-source';
import {type XlsxRow, XlsxWorkbookWriter} from './xlsx-workbook-writer';

/** Exports running at once in this instance; the rest wait in line. Each running export holds a database connection. */
const MAX_RUNNING = Number(process.env['EXPORT_MAX_RUNNING'] ?? 2);
/** How long a finished file can be downloaded, and downloaded again after a dropped connection. */
const FILE_TTL_MS = Number(process.env['EXPORT_TTL_SECONDS'] ?? 900) * 1000;
/** A job's record outlives its file, so a late retry with the same idempotency key still finds it. */
const RECORD_TTL_MS = FILE_TTL_MS * 4;
const EXPORT_DIR = process.env['EXPORT_DIR'] ?? join(tmpdir(), 'acme-dealership-exports');
/** While a job runs, the client gets a snapshot at least this often (elapsed time, estimate), even with no rows. */
const HEARTBEAT_MS = 1000;
/**
 * Rows per round trip to the database. Measured with 40 ms between the service and Postgres, 1.6 million rows: 5,000
 * a fetch took 20.1 s (334 round trips), 50,000 took 7.8 s, at about 170 MB more memory.
 */
const BATCH_SIZE = Number(process.env['EXPORT_BATCH_SIZE'] ?? 20_000);
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;

/**
 * Runs exports in the background and keeps their files for a while. The file is written to a temp file, not streamed
 * into the request: the database connection is released once the rows are written (a slow download holds nothing),
 * the download has a length and resumes, and progress reaches the client while it runs.
 * Jobs live in this instance's memory: one instance of the service, as the workshop runs it.
 */
@Injectable()
export class ExportJobRunner implements IExportJobs, OnModuleInit, OnModuleDestroy {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;
  private readonly _logger = new Logger(ExportJobRunner.name);
  private readonly _jobs = new Map<string, ExportJob>();
  private readonly _jobsByIdempotencyKey = new Map<string, ExportJob>();
  private readonly _queue: ExportJob[] = [];
  private _running = 0;
  private _sweeper: NodeJS.Timeout | null = null;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  /** Files left by a crash or a restart belong to jobs nobody can reach any more. */
  public async onModuleInit(): Promise<void> {
    await rm(EXPORT_DIR, {recursive: true, force: true});
    await mkdir(EXPORT_DIR, {recursive: true});
    this._sweeper = setInterval(() => void this.sweepAsync(), Math.min(30_000, FILE_TTL_MS / 2));
    this._sweeper.unref();
  }

  public onModuleDestroy(): void {
    if (this._sweeper) {
      clearInterval(this._sweeper);
    }
    for (const job of this._jobs.values()) {
      job.abort.abort(new Error('The service is stopping.'));
    }
  }

  /**
   * Starts an export, or returns the one this key already started: a retry after a timeout must not start a second
   * export. The same key with a different request is refused, so a client bug doesn't look like a success.
   */
  public start(userContext: UserContext, source: ExportSource, idempotencyKey: string | null): ExportJobResponseDto {
    const locationId = requireLocation(userContext);
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new UnprocessableEntityException('The Idempotency-Key is 1 to 255 printable characters.');
    }
    const keyId = idempotencyKey === null ? null : `${userContext.userId}:${idempotencyKey}`;
    const existing = keyId === null ? null : (this._jobsByIdempotencyKey.get(keyId) ?? null);
    if (existing) {
      if (existing.source.fingerprint !== source.fingerprint || existing.locationId !== locationId) {
        throw new UnprocessableEntityException('This Idempotency-Key was used for a different export.');
      }
      return existing.toDto();
    }
    const job = new ExportJob(userContext.userId, locationId, source);
    this._jobs.set(job.id, job);
    if (keyId !== null) {
      this._jobsByIdempotencyKey.set(keyId, job);
    }
    this._queue.push(job);
    this.updateQueuePositions();
    this.startNext();
    return job.toDto();
  }

  public get(userContext: UserContext, jobId: string): ExportJobResponseDto {
    return this.ownJob(userContext, jobId).toDto();
  }

  public progress(userContext: UserContext, jobId: string): Observable<ExportJobResponseDto> {
    const job = this.ownJob(userContext, jobId);
    return merge(job.changes, interval(HEARTBEAT_MS)).pipe(
      startWith(null),
      map(() => job.toDto()),
      // The last state (completed, failed, cancelled) is sent, then the stream ends.
      takeWhile(() => !job.isFinished, true),
    );
  }

  public async cancelAsync(userContext: UserContext, jobId: string): Promise<void> {
    const job = this.ownJob(userContext, jobId);
    if (job.status === 'queued') {
      this._queue.splice(this._queue.indexOf(job), 1);
      this.updateQueuePositions();
      job.fail('cancelled', 'Cancelled before it started.');
      return;
    }
    if (!job.isFinished) {
      job.abort.abort(new Error('Cancelled by the user.'));
      return;
    }
    await this.deleteFileAsync(job);
    if (job.status === 'completed') {
      job.expire();
    }
  }

  public fileForLink(jobId: string, expires: string, signature: string): ExportFile {
    const job = this._jobs.get(jobId);
    if (!job || !isValidDownloadLink(jobId, expires, signature, this._clock.now().epochMilliseconds)) {
      throw new ForbiddenException('This download link is not valid, or has run out. Export again.');
    }
    if (job.status === 'expired') {
      throw new GoneException('This export has expired. Export again.');
    }
    if (job.status !== 'completed' || job.filePath === null) {
      throw new ConflictException(`The export is ${job.status}, not completed.`);
    }
    return {path: job.filePath, bytes: job.fileBytes ?? 0, fileName: job.source.fileName};
  }

  /** Someone else's export is "not found", not "forbidden": its existence is not theirs to know. */
  private ownJob(userContext: UserContext, jobId: string): ExportJob {
    const job = this._jobs.get(jobId);
    if (!job || job.ownerId !== userContext.userId) {
      throw new NotFoundException('No such export.');
    }
    return job;
  }

  private startNext(): void {
    while (this._running < MAX_RUNNING && this._queue.length > 0) {
      const job = this._queue.shift()!;
      this._running++;
      this.updateQueuePositions();
      void this.runAsync(job).finally(() => {
        this._running--;
        this.startNext();
      });
    }
  }

  private updateQueuePositions(): void {
    this._queue.forEach((job, index) => {
      job.queuePosition = index + 1;
      job.changes.next();
    });
  }

  private async runAsync(job: ExportJob): Promise<void> {
    const path = join(EXPORT_DIR, `${job.id}.xlsx`);
    job.filePath = path;
    const writer = new XlsxWorkbookWriter(job.source.sheetName, job.source.columns);
    try {
      job.startCounting();
      await using work = await this._unitOfWorkFactory.beginAsync({readOnly: true});
      // One snapshot for the count and the rows, so the total the user sees is the number of rows in the file.
      await work.db.execute(sql`set transaction isolation level repeatable read`);
      const total = await job.source.countAsync(work.db);
      job.abort.signal.throwIfAborted();
      job.startWriting(total);

      const rows = work.stream(job.source.rowsQuery(work.db), BATCH_SIZE);
      const stop = (): void => {
        rows.destroy(job.abort.signal.reason as Error);
      };
      job.abort.signal.addEventListener('abort', stop, {once: true});
      const written = pipeline(writer.output, createWriteStream(path));
      // Awaited below once the rows are in; when the export stops early, the cleanup handles it instead.
      written.catch(() => {});
      for await (const row of rows as AsyncIterable<XlsxRow>) {
        await writer.writeRowAsync(row);
        job.rowWritten();
      }
      job.abort.signal.removeEventListener('abort', stop);
      await writer.finishAsync();
      await written;
      job.complete((await stat(path)).size, this._clock.now().epochMilliseconds + FILE_TTL_MS);
    } catch (error) {
      // Destroyed without an error on purpose: an 'error' event nobody listens for ends the whole process.
      writer.abort();
      await rm(path, {force: true});
      job.filePath = null;
      const message = error instanceof Error ? error.message : String(error);
      if (job.abort.signal.aborted) {
        job.fail('cancelled', message);
      } else {
        this._logger.error(`Export ${job.id} failed: ${message}`);
        job.fail('failed', 'The export failed. Try again.');
      }
    }
  }

  private async deleteFileAsync(job: ExportJob): Promise<void> {
    if (job.filePath !== null) {
      // A download already reading the file finishes: an open file outlives its name.
      await rm(job.filePath, {force: true});
      job.filePath = null;
    }
  }

  private async sweepAsync(): Promise<void> {
    const now = this._clock.now().epochMilliseconds;
    for (const [id, job] of this._jobs) {
      if (job.status === 'completed' && (job.expiresAt ?? now) <= now) {
        await this.deleteFileAsync(job);
        job.expire();
      }
      if (job.isFinished && now - (job.finishedAt ?? now) > RECORD_TTL_MS) {
        this._jobs.delete(id);
        for (const [key, keyed] of this._jobsByIdempotencyKey) {
          if (keyed === job) {
            this._jobsByIdempotencyKey.delete(key);
          }
        }
      }
    }
  }
}
