// Arithmetic on amounts in whole cents (docs/standards/money.md). Every function takes and returns integers, so nothing
// drifts; the one place a fraction appears (a rate) is rounded once, half away from zero.

function requireCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`${cents} is not a whole number of cents.`);
  }
}

/** Rounds to a whole number, a half going away from zero: 2.5 → 3, -2.5 → -3. `Math.round(-2.5)` is -2. */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** A price times a whole quantity: exact. */
export function timesCents(cents: number, quantity: number): number {
  requireCents(cents);
  if (!Number.isSafeInteger(quantity)) {
    throw new Error(`${quantity} is not a whole quantity.`);
  }
  return cents * quantity;
}

/** The sum of amounts: exact. */
export function sumCents(amounts: readonly number[]): number {
  let total = 0;
  for (const cents of amounts) {
    requireCents(cents);
    total += cents;
  }
  return total;
}

/**
 * A rate of an amount, in basis points (a 20% rate = 2000), rounded once: 20% of $0.99 is 19.8¢ → 20¢. Apply it to each
 * line, then add the lines; never to a total summed from unrounded parts.
 */
export function rateOfCents(cents: number, basisPoints: number): number {
  requireCents(cents);
  if (!Number.isSafeInteger(basisPoints)) {
    throw new Error(`${basisPoints} is not a whole number of basis points.`);
  }
  return roundHalfAwayFromZero((cents * basisPoints) / 10_000);
}

/**
 * An amount split into `parts` shares that always add up to it: $10.00 three ways is 334, 333, 333. The cents left
 * over go to the first shares.
 */
export function splitCents(cents: number, parts: number): number[] {
  requireCents(cents);
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new Error(`Cannot split into ${parts} shares.`);
  }
  const share = Math.trunc(cents / parts);
  const remainder = cents - share * parts;
  const step = Math.sign(remainder);
  return Array.from({ length: parts }, (_, index) => share + (index < Math.abs(remainder) ? step : 0));
}
