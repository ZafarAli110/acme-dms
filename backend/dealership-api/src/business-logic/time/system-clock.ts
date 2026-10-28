import {Injectable} from '@nestjs/common';
import type {IClock} from '#business-logic-abstractions/time/clock.interface';

/** The clock the running service uses: the system's current instant. */
@Injectable()
export class SystemClock implements IClock {
  public now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}
