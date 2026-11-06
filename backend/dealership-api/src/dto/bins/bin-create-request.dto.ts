import * as v from "valibot";

/** A new bin of the selected location. */
export const BinCreateRequestSchema = v.strictObject({
  code: v.pipe(v.string(), v.maxLength(20), v.regex(/^[A-Z0-9-]+$/), v.metadata({ example: "A-12" })),
  description: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100), v.metadata({ example: "Brakes, aisle A" })),
});
export type BinCreateRequestDto = v.InferOutput<typeof BinCreateRequestSchema>;
