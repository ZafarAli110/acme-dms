/** An instant as the API sends it: ISO 8601 in UTC, to the millisecond (`2026-10-28T13:08:27.988Z`). */
export function toIsoString(instant: Temporal.Instant): string {
  return instant.toString({smallestUnit: 'millisecond'});
}
