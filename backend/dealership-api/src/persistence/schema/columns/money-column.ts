import { customType } from "drizzle-orm/pg-core";

const DECIMAL_TEXT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Dollars as Postgres writes a numeric ("45.50", "0.1", "-3") → whole cents (4550, 10, -300). By text, never by
 * multiplying: `1.005 * 100` is 100.49999999999999 (docs/standards/money.md, rule 3).
 */
export function centsFromDecimalText(text: string): number {
  const match = DECIMAL_TEXT.exec(text.trim());
  if (!match) {
    throw new Error(`"${text}" is not an amount with at most two decimals.`);
  }
  const [, sign, dollars = "0", fraction = ""] = match;
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

/** Whole cents → dollars with two decimals, the way Postgres reads a numeric: 4550 → "45.50", -5 → "-0.05". */
export function decimalTextFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${cents} is not a whole number of cents.`);
  }
  const absolute = Math.abs(cents);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${Math.trunc(absolute / 100)}.${fraction}`;
}

/**
 * `numeric(12, 2)` in the database, whole cents in TypeScript. The database keeps an exact, readable decimal that SQL
 * can sum exactly; code only ever sees an integer it can add and multiply exactly.
 */
export const money = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric(12, 2)";
  },
  toDriver: decimalTextFromCents,
  fromDriver: centsFromDecimalText,
});
