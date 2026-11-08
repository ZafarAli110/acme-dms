import { formatNumber, normalizeDecimal } from "./formatNumber";

/**
 * Money on screen (docs/standards/money.md): the API sends and takes whole cents (`unitPriceCents: 4999`), and the user
 * sees and types dollars in their language. Cents are turned into text for Intl, never divided into a float, and what
 * the user types is read straight into cents, never through `parseFloat`.
 */

/** The currency every amount is in. */
export const CURRENCY = "USD";

/** Whole cents as dollars in text, exact: 4550 → "45.50". */
function dollarsText(cents: number): `${number}` {
  const absolute = Math.abs(cents);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${Math.trunc(absolute / 100)}.${fraction}` as `${number}`;
}

/** An amount in dollars, in the user's language: 4999 → "$49.99" in English, "49,99 $" in French. */
export function formatMoney(cents: number, language: string): string {
  return formatNumber(dollarsText(cents), language, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
  });
}

/** An amount as the user edits it: two decimals in their language, no symbol, no grouping ("45.50", "45,50"). */
export function formatMoneyInput(cents: number, language: string): string {
  return formatNumber(dollarsText(cents), language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/**
 * An amount the user typed, in their language, as whole cents: "45,50" in French → 4550. Zero or more, at most two
 * decimals; null otherwise, never rounded.
 */
export function parseMoneyCents(text: string, language: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalizeDecimal(text, language) ?? "");
  if (!match) {
    return null;
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** The currency symbol, and whether the user's language writes it before the amount ("$45.50") or after ("45,50 $"). */
export function currencySymbol(language: string): { symbol: string; isPrefix: boolean } {
  const parts = new Intl.NumberFormat(language, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(1);
  const index = parts.findIndex((part) => part.type === "currency");
  const firstNumber = parts.findIndex((part) => part.type === "integer");
  return { symbol: parts[index]?.value ?? "$", isPrefix: index < firstNumber };
}
