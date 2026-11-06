import { localized } from "#i18n/messages";
import { rm, stat } from "node:fs/promises";
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, count, desc, eq, inArray, ne, type SQL, sql } from "drizzle-orm";
import { exhaustMap, from, type Observable, startWith, takeWhile, timer } from "rxjs";
import { TooManyRequestsException } from "#business-logic-abstractions/errors/too-many-requests.exception";
import type { ExportFile, IExportJobs } from "#business-logic-abstractions/exports/export-jobs.interface";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { ExportJobResponseDto, ExportJobStatus, ExportKind } from "#dto/exports/export-job-response.dto";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { type ExportJobRow, exportJobs, type NewExportJobRow } from "#persistence/schema/export-jobs";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { SETTINGS, type Settings } from "#settings/settings";
import { requireLocation } from "../user-context/require-location";
import { isValidDownloadLink } from "./download-link";
import { toExportJobResponseDto } from "./export-job.mapper";
import type { ExportSource } from "./export-source";

// The tunable limits come from the settings (src/settings/settings.ts):
//   EXPORT_MAX_PER_USER       exports one user may have running or waiting; one more is a 429.
//   EXPORT_PROGRESS_POLL_MS   how often a followed export's row is read and sent to the browser.
// The worker's own limits (how many run, per dealer, for how long) are listed in export-worker.ts.

/** The states in which an export still holds a place: waiting in line, or being written by a worker. */
export const ACTIVE_STATUSES: readonly ExportJobStatus[] = ["queued", "counting", "writing"];
/** The states a worker is in the middle of: it holds the job and writes its heartbeat. */
export const RUNNING_STATUSES: readonly ExportJobStatus[] = ["counting", "writing"];
const FINISHED: ReadonlySet<ExportJobStatus> = new Set(["completed", "failed", "cancelled", "expired"]);
/** An Idempotency-Key is 1 to 255 printable ASCII characters (no spaces): what HTTP header values allow. */
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;
/**
 * A refused export is told to try again after this long: about how long it takes a slot to free up for a few
 * thousand rows, and long enough that a client retrying on its own does not hammer the service.
 */
const RETRY_AFTER_SECONDS = 30;

/** What a start handler asks the queue for: which list, the validated request, and what its source worked out. */
export interface ExportEnqueueRequest {
  kind: ExportKind;
  request: ExportRequestDto;
  source: ExportSource;
}

/**
 * The export queue, as the API sees it: exports are rows in `export_jobs`. Starting one inserts a row and returns at
 * once; an export worker (a process of its own, export-worker.ts) claims it, writes the file and records its progress
 * in the row, which is what following an export reads. Nothing lives in this process's memory, so a restart of the
 * API loses no export, and the API never holds a database connection for an export's rows.
 */
@Injectable()
export class ExportQueue implements IExportJobs {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;
  private readonly _settings: Settings;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
    @Inject(SETTINGS) settings: Settings,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
    this._settings = settings;
  }

  /**
   * Queues an export, or returns the one this key already started: a retry after a timeout must not start a second
   * export. The same key with a different request (or at another location) is refused, so a client bug doesn't look
   * like a success. A user with EXPORT_MAX_PER_USER exports running or waiting is refused with a 429.
   */
  public async enqueueAsync(
    userContext: UserContext,
    enqueue: ExportEnqueueRequest,
    idempotencyKey: string | null,
  ): Promise<ExportJobResponseDto> {
    const locationId = requireLocation(userContext);
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new UnprocessableEntityException(localized("exports.idempotencyKeyFormat"));
    }
    const now = this._clock.now();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // One user's starts take turns, so two at the same instant cannot both pass the limit below, nor both miss the
    // other's idempotency key. The lock is released with the transaction.
    await work.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userContext.userId}, 0))`);

    if (idempotencyKey !== null) {
      const [existing] = await work.db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.dealerId, userContext.dealerId),
            eq(exportJobs.ownerId, userContext.userId),
            eq(exportJobs.idempotencyKey, idempotencyKey),
          ),
        );
      if (existing) {
        if (existing.fingerprint !== enqueue.source.fingerprint || existing.locationId !== locationId) {
          throw new UnprocessableEntityException(localized("exports.idempotencyKeyReused"));
        }
        return toExportJobResponseDto(existing, await this.queuePositionAsync(work.db, existing), now);
      }
    }

    const [active] = await work.db
      .select({ total: count() })
      .from(exportJobs)
      .where(
        and(
          eq(exportJobs.dealerId, userContext.dealerId),
          eq(exportJobs.ownerId, userContext.userId),
          inArray(exportJobs.status, ACTIVE_STATUSES),
        ),
      );
    const limit = this._settings.exportMaxPerUser;
    if ((active?.total ?? 0) >= limit) {
      throw new TooManyRequestsException(localized("exports.tooManyRunning", { limit }), RETRY_AFTER_SECONDS);
    }

    const job: NewExportJobRow = {
      dealerId: userContext.dealerId,
      locationId,
      ownerId: userContext.userId,
      kind: enqueue.kind,
      request: storedRequest(enqueue.request),
      fileName: enqueue.source.fileName,
      fingerprint: enqueue.source.fingerprint,
      idempotencyKey,
      status: "queued",
      createdAt: now,
    };
    const [inserted] = await work.db.insert(exportJobs).values(job).returning();
    const position = await this.queuePositionAsync(work.db, inserted!);
    await work.commitAsync();
    return toExportJobResponseDto(inserted!, position, now);
  }

  public async getAsync(userContext: UserContext, jobId: string): Promise<ExportJobResponseDto> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const job = await this.ownJobAsync(work.db, userContext, jobId);
    return toExportJobResponseDto(job, await this.queuePositionAsync(work.db, job), this._clock.now());
  }

  /** The user's exports at the selected location that still mean something (not expired), newest first. */
  public async listAsync(userContext: UserContext): Promise<ExportJobResponseDto[]> {
    const locationId = requireLocation(userContext);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const jobs = await work.db
      .select()
      .from(exportJobs)
      .where(
        and(
          eq(exportJobs.dealerId, userContext.dealerId),
          eq(exportJobs.locationId, locationId),
          eq(exportJobs.ownerId, userContext.userId),
          ne(exportJobs.status, "expired"),
        ),
      )
      .orderBy(desc(exportJobs.createdAt), desc(exportJobs.id));
    const now = this._clock.now();
    const listed: ExportJobResponseDto[] = [];
    for (const job of jobs) {
      listed.push(toExportJobResponseDto(job, await this.queuePositionAsync(work.db, job), now));
    }
    return listed;
  }

  /**
   * The export's state now, then again every EXPORT_PROGRESS_POLL_MS, read from its row (the worker writes it about
   * once a second); the stream ends after the last state. Someone else's export is a 404 before the stream starts.
   */
  public async progressAsync(userContext: UserContext, jobId: string): Promise<Observable<ExportJobResponseDto>> {
    const first = await this.getAsync(userContext, jobId);
    const pollMs = this._settings.exportProgressPollMs;
    return timer(pollMs, pollMs).pipe(
      // A slow read is not queued up behind: the next tick that finds the last read done reads again.
      exhaustMap(() => from(this.getAsync(userContext, jobId))),
      startWith(first),
      // The last state (completed, failed, cancelled) is sent, then the stream ends.
      takeWhile((job) => !FINISHED.has(job.status), true),
    );
  }

  /**
   * A waiting export is cancelled at once. A running one is asked to stop: its worker sees the request at its next
   * progress check (about a second) and marks it cancelled. A finished one's file is deleted now.
   */
  public async cancelAsync(userContext: UserContext, jobId: string): Promise<void> {
    const now = this._clock.now();
    await using work = await this._unitOfWorkFactory.beginAsync();
    // Locked, so a worker cannot claim it between this read and the update below (it skips locked rows).
    const job = await this.ownJobAsync(work.db, userContext, jobId, { lock: true });
    const own = this.ownJobWhere(userContext, jobId);
    if (job.status === "queued") {
      await work.db
        .update(exportJobs)
        .set({ status: "cancelled", error: "exports.failure.cancelledBeforeStart", finishedAt: now })
        .where(own);
    } else if (RUNNING_STATUSES.includes(job.status)) {
      await work.db
        .update(exportJobs)
        .set({ cancelRequestedAt: job.cancelRequestedAt ?? now })
        .where(own);
    } else if (job.status === "completed") {
      if (job.filePath !== null) {
        // A download already reading the file finishes: an open file outlives its name.
        await rm(job.filePath, { force: true });
      }
      await work.db.update(exportJobs).set({ status: "expired", filePath: null }).where(own);
    }
    await work.commitAsync();
  }

  public async fileForLinkAsync(jobId: string, expires: string, signature: string): Promise<ExportFile> {
    const now = this._clock.now();
    if (!isValidDownloadLink(jobId, expires, signature, now.epochMilliseconds)) {
      throw new ForbiddenException(localized("exports.linkInvalid"));
    }
    // The signed link is the permission (it was handed only to the owner), so the row is read by its id alone. The
    // download has no token, so no scope: it reads as the owner role, the one read in a request that does.
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    const [job] = await work.db.select().from(exportJobs).where(eq(exportJobs.id, jobId));
    if (!job) {
      throw new ForbiddenException(localized("exports.linkInvalid"));
    }
    const expired =
      job.status === "expired" || (job.expiresAt !== null && Temporal.Instant.compare(job.expiresAt, now) <= 0);
    if (expired) {
      throw new GoneException(localized("exports.expired"));
    }
    if (job.status !== "completed" || job.filePath === null) {
      throw new ConflictException(localized("exports.notCompleted", { status: job.status }));
    }
    const bytes = await stat(job.filePath).then(
      (file) => file.size,
      () => null,
    );
    if (bytes === null) {
      throw new GoneException(localized("exports.fileGone"));
    }
    return { path: job.filePath, bytes, fileName: job.fileName };
  }

  /** Someone else's export is "not found", not "forbidden": its existence is not theirs to know. */
  private async ownJobAsync(
    db: Database,
    userContext: UserContext,
    jobId: string,
    options: { lock: boolean } = { lock: false },
  ): Promise<ExportJobRow> {
    const query = db.select().from(exportJobs).where(this.ownJobWhere(userContext, jobId));
    const [job] = options.lock ? await query.for("update") : await query;
    if (!job) {
      throw new NotFoundException(localized("exports.notFound"));
    }
    return job;
  }

  private ownJobWhere(userContext: UserContext, jobId: string): SQL | undefined {
    return and(
      eq(exportJobs.id, jobId),
      eq(exportJobs.dealerId, userContext.dealerId),
      eq(exportJobs.ownerId, userContext.userId),
    );
  }

  /**
   * Its place in line: the waiting exports asked for before it, plus one. Workers let dealers take turns, so this is
   * the most it can be, not an exact forecast; it only counts, and never shows whose exports they are.
   */
  private async queuePositionAsync(db: Database, job: ExportJobRow): Promise<number | null> {
    if (job.status !== "queued") {
      return null;
    }
    // A function (migration 0004), not a query: row-level security shows a request only its own exports, and the
    // place in line counts everyone's. Only the number comes back.
    const result = await db.execute<{ position: string }>(
      sql`SELECT export_queue_position(${job.createdAt.toString()}::timestamptz, ${job.id}::uuid) AS position`,
    );
    return Number(result.rows[0]?.position ?? 1);
  }
}

/** What is kept of the request: the list's query and the columns, not the page it was asked from. */
function storedRequest(request: ExportRequestDto): ExportRequestDto {
  return {
    columns: request.columns.map((column) => ({ field: column.field, header: column.header })),
    search: request.search,
    sort: request.sort,
    direction: request.direction,
    filterField: request.filterField,
    filterOperator: request.filterOperator,
    filterValue: request.filterValue,
  };
}
