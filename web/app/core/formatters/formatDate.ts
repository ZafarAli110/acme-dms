/**
 * Dates as the API sends them, shown in the user's language. Built on Temporal and Intl: a moment is converted to the
 * user's time zone; a calendar day never is.
 */

/** A moment (`createdAt`: ISO 8601 with `Z`) in the user's language and time zone: "28 Oct 2026, 14:08". */
export function formatInstant(
  iso: string,
  language: string,
  options: Intl.DateTimeFormatOptions = {dateStyle: 'medium', timeStyle: 'short'},
): string {
  return Temporal.Instant.from(iso).toLocaleString(language, options);
}

/** A calendar day (`YYYY-MM-DD`, such as a customer's last contact) in the user's language: "24 Oct 2026". */
export function formatPlainDate(
  isoDate: string,
  language: string,
  options: Intl.DateTimeFormatOptions = {dateStyle: 'medium'},
): string {
  return Temporal.PlainDate.from(isoDate).toLocaleString(language, options);
}

/** How long ago a calendar day was, in the user's language: "3 days ago", "last month", "il y a 3 jours". */
export function formatDaysAgo(isoDate: string, language: string): string {
  const today = Temporal.Now.plainDateISO();
  const days = Temporal.PlainDate.from(isoDate).until(today, {largestUnit: 'day'}).days;
  const format = new Intl.RelativeTimeFormat(language, {numeric: 'auto'});
  if (days < 30) {
    return format.format(-days, 'day');
  }
  if (days < 365) {
    return format.format(-Math.round(days / 30), 'month');
  }
  return format.format(-Math.round(days / 365), 'year');
}
