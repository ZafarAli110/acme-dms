# Money

Applies to every price and every amount worked out from prices: a part's price today; stock value, quotes, invoices,
sales tax and discounts later. Every amount is in US dollars (USD), with two decimals.

## Why it needs a rule

A JavaScript `number` is a binary fraction, and most decimal amounts have no exact binary form: `0.1 + 0.2` is
`0.30000000000000004`, `1.15 * 100` is `114.99999999999999`, and `(1.005).toFixed(2)` is `"1.00"`. Storing a price that
way is harmless; adding, multiplying and rounding it is how an invoice ends up a cent out. JavaScript has no decimal
type (TC39's Decimal proposal is at an early stage), and Acme adds no money library: whole numbers are exact in a
`number` up to 9,007,199,254,740,991, so **amounts are whole cents**.

## Rules

1. **In TypeScript, an amount is an integer number of cents**, named so: `unitPriceCents`, `stockValueCents`. Never a
   dollar amount with decimals in a variable, a DTO or a calculation.
2. **The database stores `numeric(12, 2)`**, an exact decimal: readable in SQL, and `sum()` over it is exact. The
   column type converts dollars ↔ cents (`backend/dealership-api/src/persistence/schema/columns/money-column.ts`), so a
   handler only ever sees cents.
3. **Convert by text, never by multiplying.** `"45.50"` → `4550` by splitting at the decimal point; `4550` → `"45.50"`
   by integer division. `Math.round(45.5 * 100)` happens to work and `Math.round(1.005 * 100)` does not: do not rely on
   it.
4. **Calculate with integers only.** `unitPriceCents * quantity` is exact. A rate is an integer in basis points (8.25%
   sales tax = 825): `taxCents = roundHalfAwayFromZero(amountCents * 825 / 10000)`. Never multiply cents by `0.0825`.
5. **Round once, half away from zero, where the business says**: per invoice line, then add the lines; never round a
   total that was summed from unrounded parts. `Math.round` is not this rule: it rounds −2.5 to −2, so a refund rounds
   differently from a sale.
6. **A split never loses a cent**: dividing $10.00 three ways is 334 + 333 + 333, the remainder going to the first
   shares, not 333 × 3.
7. **Totals over many rows are summed in SQL** (`sum(quantity * unit_price)`, exact in `numeric`), and arrive as text
   like every numeric, converted by rule 3. Never load every row to add them up in TypeScript.
8. **The API carries cents as integers** (`"unitPriceCents": 4550`). No client parses money through a float.
9. **A price is refused, never rounded**: more than two decimals, a negative price or one above the column's
   9,999,999,999.99 is a `400` with a message saying why (see `docs/standards/api-errors.md`).
10. **Screens show and read dollars in the user's language** (`$45.50`, `45,50 $`) through the web app's price
    formatter, and parse what the user typed straight into cents: never `parseFloat`.

## Checks

- A test for every calculation with amounts that a float gets wrong: 0.10 × 3, 0.10 + 0.20, 1.005, a split of 1000
  three ways, and a negative amount rounded.
- The sum of the lines equals the total, to the cent, in every test that shows both.
