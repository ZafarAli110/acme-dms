/**
 * The current time. Handlers ask the clock instead of reading the system time, so a test can run them at a fixed
 * moment; .NET handlers do the same with TimeProvider.
 */
export interface IClock {
  /** This instant, in UTC. */
  now(): Temporal.Instant;
}

export const CLOCK = Symbol('IClock');
