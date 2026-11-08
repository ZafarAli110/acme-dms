import * as v from "valibot";

const wholeNumberFromZero = v.pipe(v.number(), v.integer(), v.minValue(0));

/**
 * A price in whole pence (4999 = £49.99): never a pound amount with decimals, so no client parses money through a float
 * (docs/standards/money.md). At most £9,999,999,999.99, what the database's `numeric(12, 2)` holds.
 */
export const unitPriceCents = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(999_999_999_999),
  v.description("In pence: 4999 is £49.99"),
  v.metadata({ example: 4999 }),
);

/**
 * A new part is always created at the selected location, into one of that location's bins (`GET /v1/bins`): a part
 * that is not stocked anywhere cannot be found.
 */
export const PartCreateRequestSchema = v.strictObject({
  partNumber: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(50),
    v.regex(/^[A-Z0-9-]+$/),
    v.metadata({ example: "BRK-PAD-001" }),
  ),
  description: v.pipe(v.string(), v.nonEmpty(), v.maxLength(500), v.metadata({ example: "Front brake pads, ceramic" })),
  unitPriceCents,
  binId: v.pipe(v.string(), v.uuid(), v.description("A bin of the selected location (GET /v1/bins)")),
  quantityOnHand: v.pipe(wholeNumberFromZero, v.metadata({ example: 6 })),
  reorderLevel: v.pipe(wholeNumberFromZero, v.metadata({ example: 4 })),
});
export type PartCreateRequestDto = v.InferOutput<typeof PartCreateRequestSchema>;
