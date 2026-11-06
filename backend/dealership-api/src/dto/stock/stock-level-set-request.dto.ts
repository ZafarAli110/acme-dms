import * as v from "valibot";

const wholeNumberFromZero = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Sets the part's inventory at the selected location; stocks the part there if the location did not have it yet. */
export const StockLevelSetRequestSchema = v.strictObject({
  binId: v.pipe(v.string(), v.uuid(), v.description("A bin of the selected location (GET /v1/bins)")),
  quantityOnHand: v.pipe(wholeNumberFromZero, v.metadata({ example: 12 })),
  reorderLevel: v.pipe(wholeNumberFromZero, v.metadata({ example: 4 })),
});
export type StockLevelSetRequestDto = v.InferOutput<typeof StockLevelSetRequestSchema>;
