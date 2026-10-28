import type {IClock} from '#business-logic-abstractions/time/clock.interface';

/** The moment every handler test runs at: the first morning of the workshop. */
export const TEST_NOW = Temporal.Instant.from('2026-11-03T09:00:00Z');

/** A clock that always says `at`, so a test can assert the exact times a handler stamps. */
export function fixedClock(at: Temporal.Instant = TEST_NOW): IClock {
  return {now: () => at};
}
