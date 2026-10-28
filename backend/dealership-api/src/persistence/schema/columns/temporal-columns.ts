import {customType} from 'drizzle-orm/pg-core';

/**
 * `timestamptz` as a `Temporal.Instant` (UTC). Postgres sends text such as `2026-11-03 09:00:00+00`; the driver may
 * already have turned it into a `Date`, which carries the same instant.
 */
export const instant = customType<{data: Temporal.Instant; driverData: string}>({
  dataType() {
    return 'timestamptz';
  },
  toDriver(value) {
    return value.toString();
  },
  fromDriver(value: string | Date) {
    return value instanceof Date
      ? Temporal.Instant.fromEpochMilliseconds(value.getTime())
      : Temporal.Instant.from(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  },
});

/**
 * `date` (a calendar day, no time or zone) as a `Temporal.PlainDate`. A `Date` from the driver is read by its local
 * calendar fields, which is how the driver built it, so the day never shifts with the machine's time zone.
 */
export const plainDate = customType<{data: Temporal.PlainDate; driverData: string}>({
  dataType() {
    return 'date';
  },
  toDriver(value) {
    return value.toString();
  },
  fromDriver(value: string | Date) {
    return value instanceof Date
      ? new Temporal.PlainDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
      : Temporal.PlainDate.from(value);
  },
});
