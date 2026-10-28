import type {ValueTransformer} from 'typeorm';

/**
 * A `timestamptz` column as a Temporal.Instant. Postgres stores the instant in UTC; the driver hands over a JS Date,
 * which is turned into an Instant here and back on the way in.
 */
export const INSTANT_COLUMN: ValueTransformer = {
  to: (value: Temporal.Instant | null | undefined) => (value ? new Date(value.epochMilliseconds) : value),
  from: (value: Date | null) => (value ? Temporal.Instant.fromEpochMilliseconds(value.getTime()) : value),
};

/** A `date` column (a calendar day, no time and no time zone) as a Temporal.PlainDate. */
export const PLAIN_DATE_COLUMN: ValueTransformer = {
  to: (value: Temporal.PlainDate | null | undefined) => (value ? value.toString() : value),
  from: (value: string | null) => (value ? Temporal.PlainDate.from(value) : value),
};
