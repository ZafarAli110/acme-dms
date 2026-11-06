import { toJsonSchema } from "@valibot/to-json-schema";
import type { GenericSchema } from "valibot";

/**
 * A Valibot schema as the OpenAPI schema Swagger shows. Valibot's own conversion, with two corrections so the
 * document describes what a client may send:
 *
 * - A field that may be left out (`omittable`, which also takes `null` as "not sent") is shown as that field, not as
 *   "the field or null": the document marks it optional by leaving it out of `required`.
 * - A number read from a query string or a JSON body (a string or a number turned into one) is shown as a number.
 *
 * Rules that are a function (`v.check`) cannot be written as JSON; give such a schema a `v.description` and, where
 * JSON Schema has the keyword, a `v.metadata` (a price: `multipleOf`).
 */
export function valibotToOpenApi(schema: unknown): { schema: unknown } {
  return {
    schema: toJsonSchema(schema as GenericSchema, {
      errorMode: "ignore",
      overrideSchema: ({ valibotSchema, jsonSchema }) => {
        if (valibotSchema.type === "nullish") {
          return jsonSchema.anyOf?.find((option) => typeof option === "object" && option.type !== "null") as
            typeof jsonSchema | undefined;
        }
        if (valibotSchema.type === "union") {
          const options = (valibotSchema as unknown as { options: { type: string }[] }).options;
          return options.every((option) => option.type === "string" || option.type === "number")
            ? { type: "number" }
            : undefined;
        }
        return undefined;
      },
    }),
  };
}
