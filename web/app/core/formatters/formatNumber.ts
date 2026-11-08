/**
 * Numbers as the user's language writes them, read back the same way. Built on Intl: the separators come from
 * Intl.NumberFormat for the language (`formatToParts`), never from a list of our own.
 */

/**
 * A number in the user's language: 1600 is "1,600" in English, "1 600" in French. A decimal given as text ("45.50") is
 * formatted exactly, never through a float.
 */
export function formatNumber(
  value: number | `${number}`,
  language: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(language, options).format(value);
}

/** A file size in megabytes, one decimal: "12.5 MB", "12,5 Mo". */
export function formatFileSize(bytes: number, language: string): string {
  return formatNumber(bytes / 1_048_576, language, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });
}

/**
 * A decimal the user typed, read the way their language writes it: "45,50" or "1 234,50" in French, "45.50" or
 * "1,234.50" in English. A dot is read as the decimal point in every language, since people type it anyway. Null when
 * the text is not a number.
 */
export function parseDecimal(text: string, language: string): number | null {
  const normalized = normalizeDecimal(text, language);
  return normalized === null ? null : Number(normalized);
}

/**
 * What the user typed, rewritten with a dot as the decimal point and no grouping ("1 234,50" in French → "1234.50"),
 * still as text, so an amount can be read exactly (into pence) without passing through a float. Null when the text is
 * not a number.
 */
export function normalizeDecimal(text: string, language: string): string | null {
  const parts = new Intl.NumberFormat(language).formatToParts(12345.6);
  const group = parts.find((part) => part.type === "group")?.value ?? ",";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  let normalized = text.trim().replace(/\s/g, "");
  if (!/\s/.test(group)) {
    normalized = normalized.replaceAll(group, "");
  }
  if (decimal !== ".") {
    normalized = normalized.replace(decimal, ".");
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}
