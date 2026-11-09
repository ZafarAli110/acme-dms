import * as v from "valibot";
import { omittable, PAGE_QUERY_ENTRIES } from "./page-query.dto";

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * The operators a list column can be filtered with, by the column's type. The names are the data grid's, so the web
 * app sends its filter as it is.
 */
export const FILTER_OPERATORS = {
  text: ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  number: ["=", "!=", ">", ">=", "<", "<=", "isEmpty", "isNotEmpty"],
  date: ["is", "not", "after", "onOrAfter", "before", "onOrBefore", "isEmpty", "isNotEmpty"],
  /** One of a fixed set of values (a status): the grid shows them in a dropdown. */
  choice: ["is", "not"],
  /** A phone, by its digits alone: its start, its end, or all of it (ACME-129). */
  phone: ["startsWith", "endsWith", "equals", "isEmpty", "isNotEmpty"],
} as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[keyof typeof FILTER_OPERATORS][number];
const ALL_OPERATORS = [...new Set(Object.values(FILTER_OPERATORS).flat())] as [FilterOperator, ...FilterOperator[]];

const FIELD_OF_THE_LIST = "A field of the list; the list says which";

/** The entries of a list page's query, to build on (an export adds its columns). */
export const LIST_QUERY_ENTRIES = {
  ...PAGE_QUERY_ENTRIES,
  sort: omittable(v.pipe(v.string(), v.maxLength(50), v.description(FIELD_OF_THE_LIST))),
  direction: omittable(v.picklist(SORT_DIRECTIONS)),
  filterField: omittable(v.pipe(v.string(), v.maxLength(50), v.description(FIELD_OF_THE_LIST))),
  filterOperator: omittable(v.picklist(ALL_OPERATORS)),
  filterValue: omittable(
    v.pipe(v.string(), v.maxLength(200), v.description("Not needed for isEmpty and isNotEmpty; a date is YYYY-MM-DD")),
  ),
  // Keyset paging (ACME-129): the page after or before a page's cursor, or the last page. Without them, `page`.
  after: omittable(v.pipe(v.string(), v.maxLength(2000), v.description("The page after this cursor: a page's `next`"))),
  before: omittable(
    v.pipe(v.string(), v.maxLength(2000), v.description("The page before this cursor: a page's `previous`")),
  ),
  last: omittable(
    v.pipe(
      v.picklist(["true"]),
      v.transform(() => true as const),
      v.description("The list's last page"),
    ),
  ),
};

/**
 * A list page's query: the page, a free-text search, one sort and one filter, as the data grid offers them.
 * `?search=&page=&pageSize=&sort=city&direction=desc&filterField=status&filterOperator=equals&filterValue=active`.
 * Which fields can be sorted and filtered is each list's own; another field is a 400.
 */
export const ListQuerySchema = v.pipe(
  v.strictObject(LIST_QUERY_ENTRIES),
  v.check(
    (query) => [query.after, query.before, query.last].filter(Boolean).length <= 1,
    "validation.atMostOneListPosition",
  ),
);
export type ListQueryDto = v.InferOutput<typeof ListQuerySchema>;
