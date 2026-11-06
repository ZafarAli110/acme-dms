import * as v from "valibot";
import { LIST_QUERY_ENTRIES } from "../paging/list-query.dto";
import { omittable } from "../paging/page-query.dto";

/**
 * One column of the file: the list's field, under the heading the user sees it with (in their language). Without a
 * header, the column's own heading is used (`Last contact` for `lastContactDate`), never the database's column name.
 */
export const ExportColumnSchema = v.strictObject({
  field: v.pipe(v.string(), v.maxLength(50)),
  header: omittable(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
});
export type ExportColumnDto = v.InferOutput<typeof ExportColumnSchema>;

/**
 * An export of a list as it is shown: its search, sort and filter (the list's query, every page) and its visible
 * columns, in their order. `page` and `pageSize` are ignored: the file holds every row.
 */
export const ExportRequestSchema = v.strictObject({
  ...LIST_QUERY_ENTRIES,
  columns: v.pipe(v.array(ExportColumnSchema), v.minLength(1), v.maxLength(30)),
});
export type ExportRequestDto = v.InferOutput<typeof ExportRequestSchema>;
