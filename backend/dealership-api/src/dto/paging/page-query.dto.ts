import * as v from "valibot";

/** A whole number from a query string (`"2"`) or a JSON body (`2`). */
const wholeNumber = (minimum: number) =>
  v.pipe(v.union([v.string(), v.number()]), v.toNumber(), v.integer(), v.minValue(minimum));

/** A value that may be left out, or sent as `null`: either way the property is absent. */
export const omittable = <TSchema extends v.GenericSchema>(schema: TSchema) =>
  v.pipe(
    v.nullish(schema),
    v.transform((value) => value ?? undefined),
  );

/** The entries every list query has: `?search=brake&page=1&pageSize=25`. */
export const PAGE_QUERY_ENTRIES = {
  search: omittable(
    v.pipe(v.string(), v.maxLength(100), v.description("Free text; each list says which fields it matches")),
  ),
  page: omittable(v.pipe(wholeNumber(1), v.description("From 1; the default is 1"))),
  pageSize: omittable(v.pipe(wholeNumber(1), v.maxValue(100), v.description("From 1 to 100; the default is 25"))),
};
