import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { IGetHealthQueryHandler } from "#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface";
import type { HealthCheckResponseDto } from "#dto/system/health-check-response.dto";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import { exportJobs } from "#persistence/schema/export-jobs";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";

/** The database must answer within this: a database that barely answers is as bad as one that is down. */
const DATABASE_ANSWER_MS = 2_000;
/**
 * An export waiting this long for the export worker means the worker has stopped (it takes one within seconds). Only
 * exports queued since this instance started count: the worker waits for the API to be healthy before it starts, so
 * exports left from an earlier run must not keep the API red (ExportQueue fails those after 30 minutes).
 */
const EXPORT_WAIT_MINUTES = 5;

/**
 * Up, which version, and whether it can do its work: the database answers quickly, and the export worker is taking the
 * exports queued. Aspire polls it (GET /v1/system/health), and the controller answers 503 when it is degraded, so "every
 * check green while the app is broken" cannot happen: a slow database or a stopped worker turns the resource red.
 */
@Injectable()
export class GetHealthQueryHandler implements IGetHealthQueryHandler {
  private readonly _logger = new Logger(GetHealthQueryHandler.name);
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _startedAt: Temporal.Instant;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._startedAt = clock.now();
  }

  public async executeAsync(): Promise<HealthCheckResponseDto> {
    const check = await withinAsync(this.checkAsync(), DATABASE_ANSWER_MS);
    const databaseReachable = check !== "too slow" && check !== "unreachable";
    const problem =
      check === "too slow"
        ? `the database took more than ${DATABASE_ANSWER_MS} ms to answer`
        : check === "unreachable"
          ? "the database does not answer"
          : check > 0
            ? `${check} export(s) waited more than ${EXPORT_WAIT_MINUTES} minutes: is the export worker running?`
            : null;
    if (problem) {
      this._logger.warn(`Degraded: ${problem}`);
    }
    return {
      service: "dealership-api",
      status: problem ? "degraded" : "ok",
      version: APP_VERSION,
      databaseReachable,
    };
  }

  /** How many exports have waited too long, or "unreachable". As the owner: a health check has no dealer to scope to. */
  private async checkAsync(): Promise<number | "unreachable"> {
    try {
      await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
      const [row] = await work.db
        .select({ waiting: sql<number>`count(*)::int` })
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.status, "queued"),
            gt(exportJobs.createdAt, this._startedAt),
            lt(exportJobs.createdAt, sql`now() - make_interval(mins => ${EXPORT_WAIT_MINUTES})`),
          ),
        );
      return row?.waiting ?? 0;
    } catch {
      return "unreachable";
    }
  }
}

/** The promise's value, or "too slow" when it takes longer than `ms`. */
async function withinAsync<T>(promise: Promise<T>, ms: number): Promise<T | "too slow"> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tooSlow = new Promise<"too slow">((resolve) => {
    timer = setTimeout(() => resolve("too slow"), ms);
    timer.unref();
  });
  try {
    return await Promise.race([promise, tooSlow]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
