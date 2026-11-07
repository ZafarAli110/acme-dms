import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { CLOCK, type IClock } from "#business-logic-abstractions/time/clock.interface";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { sweepPhotosAsync } from "./photo-outcome";

const SWEEP_MS = 60_000;

/** Runs the photo sweep (`sweepPhotosAsync`) once a minute, in every instance of the API. */
@Injectable()
export class PhotoSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly _logger = new Logger(PhotoSweeper.name);
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _clock: IClock;
  private _timer: NodeJS.Timeout | null = null;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(CLOCK) clock: IClock,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._clock = clock;
  }

  public onApplicationBootstrap(): void {
    this._timer = setInterval(() => void this.sweepAsync(), SWEEP_MS);
    // A timer that keeps nothing alive: shutting down never waits for the next sweep.
    this._timer.unref();
  }

  public onApplicationShutdown(): void {
    if (this._timer) {
      clearInterval(this._timer);
    }
  }

  /** One sweep. Never rejects: a sweep that fails is logged, and the next one tries again. */
  public async sweepAsync(): Promise<void> {
    try {
      await using work = await this._unitOfWorkFactory.beginAsync();
      const { timedOut } = await sweepPhotosAsync(work.db, this._clock.now());
      await work.commitAsync();
      if (timedOut > 0) {
        this._logger.warn(`Failed ${timedOut} photos still processing after the deadline: their events never came.`);
      }
    } catch (error) {
      this._logger.error(`Sweeping photos failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
