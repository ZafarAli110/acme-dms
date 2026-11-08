import { formatNumber, normalizeDecimal } from "../../../core/formatters/formatNumber";

/** The currency every price is in: Acme is a British dealer group (docs/standards/money.md). */
export const CURRENCY = "GBP";

/** Whole pence as pounds in text, exact: 4550 → "45.50". Intl formats a string exactly, never through a float. */
function poundsText(cents: number): `${number}` {
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}` as `${number}`;
}

/** A price in pounds, in the user's language: 4999 → "£49.99", "49,99 £". */
export function formatPrice(cents: number, language: string): string {
  return formatNumber(poundsText(cents), language, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
  });
}

/** A price as the user edits it: two decimals in their language, no symbol, no grouping ("45.50", "45,50"). */
export function formatPriceInput(cents: number, language: string): string {
  return formatNumber(poundsText(cents), language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

/**
 * A price the user typed, in their language, as whole pence: "45,50" → 4550. Zero or more, at most two decimals;
 * null otherwise, never rounded. Read from the text, never through `parseFloat`.
 */
export function parsePriceCents(text: string, language: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalizeDecimal(text, language) ?? "");
  if (!match) {
    return null;
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
