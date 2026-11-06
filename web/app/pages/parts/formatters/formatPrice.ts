import { formatNumber, parseDecimal } from "../../../core/formatters/formatNumber";

/** The currency every price is in. */
export const CURRENCY = "USD";

/** A price in dollars, in the user's language: "$49.99", "49,99 $". */
export function formatPrice(value: number, language: string): string {
  return formatNumber(value, language, { style: "currency", currency: CURRENCY, currencyDisplay: "narrowSymbol" });
}

/** A price as the user edits it: two decimals in their language, no symbol, no grouping ("45.50", "45,50"). */
export function formatPriceInput(value: number, language: string): string {
  return formatNumber(value, language, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

/** A price the user typed, in their language: zero or more, at most two decimals (cents). Null otherwise. */
export function parsePrice(text: string, language: string): number | null {
  const value = parseDecimal(text, language);
  if (value === null || value < 0) {
    return null;
  }
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-9 ? value : null;
}
