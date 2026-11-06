import * as v from "valibot";

const wholeNumberFromZero = v.pipe(v.number(), v.integer(), v.minValue(0));

/** A price in pounds and pence: not negative, at most two decimals. */
export const unitPrice = v.pipe(
  v.number(),
  v.minValue(0),
  v.check((price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-6),
  v.description("In pounds, at most two decimals"),
  // `check` is a function and cannot be written as JSON; `multipleOf` says the same to Swagger.
  v.metadata({ example: 49.99, multipleOf: 0.01 }),
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
  unitPrice,
  binId: v.pipe(v.string(), v.uuid(), v.description("A bin of the selected location (GET /v1/bins)")),
  quantityOnHand: v.pipe(wholeNumberFromZero, v.metadata({ example: 6 })),
  reorderLevel: v.pipe(wholeNumberFromZero, v.metadata({ example: 4 })),
});
export type PartCreateRequestDto = v.InferOutput<typeof PartCreateRequestSchema>;
