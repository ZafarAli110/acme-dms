/** A price in pounds, in the user's language ("£49.99", "49,99 £"). */
export function formatPrice(value: number, language: string): string {
  return new Intl.NumberFormat(language, {style: 'currency', currency: 'GBP', currencyDisplay: 'narrowSymbol'}).format(
    value,
  );
}
