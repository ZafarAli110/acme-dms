export type SortDirection = "asc" | "desc";

/** The one filter a list can have, as the data grid builds it: a field, an operator and, for most operators, a value. */
export interface ListFilter {
  field: string;
  /** The grid's operator name (`contains`, `>=`, `after`, …); the API takes the same names. */
  operator: string;
  /** Text as typed, a number as text, a date as YYYY-MM-DD; null for `isEmpty` and `isNotEmpty`. */
  value: string | null;
}

/**
 * How a page was reached by keyset (ACME-129): after or before a page's cursor (the API's `next` and `previous`), or the
 * list's last page. Each page then costs what the first costs, however deep.
 */
export type ListCursor = { after: string } | { before: string } | { last: true };

/**
 * What a list page shows: the search, the page, one sort and one filter. They live in the URL, so a refresh or a shared
 * link keeps them.
 */
export interface ListParams {
  search: string;
  /**
   * 1-based, as the API and the URL count. Null when it is not known: the last page, and pages before it reached with
   * Previous (ACME-129).
   */
  page: number | null;
  /** The page by keyset; null for a page by its number (a jump, up to row 10,000). */
  cursor: ListCursor | null;
  pageSize: number;
  /** A field of the list, or null for the list's own order. */
  sort: string | null;
  direction: SortDirection;
  filter: ListFilter | null;
}

/** The free data grid shows at most 100 rows a page. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
/** How many rows deep the API lets a list page reach (page × page size); a deeper page is a 400. Keep it equal to MAX_LIST_DEPTH in the API. */
export const MAX_LIST_DEPTH = 10_000;

/**
 * Reads a list page's params from the URL
 * (`?search=brake&page=2&pageSize=50&sort=onHand&direction=desc&filterField=bin&filterOperator=startsWith&filterValue=A`);
 * anything invalid falls back. Whether the list has that field is the API's to say.
 */
export function readListParams(searchParams: URLSearchParams): ListParams {
  const requestedPage = Number(searchParams.get("page"));
  const requestedPageSize = Number(searchParams.get("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;
  const cursor = readCursor(searchParams);
  const numbered = Number.isInteger(requestedPage) && requestedPage >= 1;
  // A shared link to a page the API would refuse opens on the last page it allows. A page reached by keyset keeps the
  // number it was counted to (past row 10,000 too), or none.
  const page = cursor
    ? numbered
      ? requestedPage
      : null
    : numbered
      ? Math.min(requestedPage, Math.floor(MAX_LIST_DEPTH / pageSize))
      : 1;
  const filterField = searchParams.get("filterField");
  const filterOperator = searchParams.get("filterOperator");
  return {
    search: searchParams.get("search") ?? "",
    page,
    cursor,
    pageSize,
    sort: searchParams.get("sort"),
    direction: searchParams.get("direction") === "desc" ? "desc" : "asc",
    filter:
      filterField && filterOperator
        ? { field: filterField, operator: filterOperator, value: searchParams.get("filterValue") }
        : null,
  };
}

/** The params as a query string, leaving out the defaults so a plain list keeps a plain URL. */
export function toListSearchParams(params: ListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.page !== null && (params.page !== 1 || params.cursor)) {
    searchParams.set("page", String(params.page));
  }
  if (params.cursor) {
    if ("after" in params.cursor) {
      searchParams.set("after", params.cursor.after);
    } else if ("before" in params.cursor) {
      searchParams.set("before", params.cursor.before);
    } else {
      searchParams.set("last", "true");
    }
  }
  if (params.pageSize !== DEFAULT_PAGE_SIZE) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
    searchParams.set("direction", params.direction);
  }
  if (params.filter) {
    searchParams.set("filterField", params.filter.field);
    searchParams.set("filterOperator", params.filter.operator);
    if (params.filter.value !== null) {
      searchParams.set("filterValue", params.filter.value);
    }
  }
  return searchParams;
}

/**
 * The query string the API's list endpoints take: the same names, with the page sent for a page by its number and
 * left out for one by keyset (the API finds that one from its cursor).
 */
export function toListApiQuery(params: ListParams): string {
  const searchParams = toListSearchParams(params);
  if (params.cursor) {
    searchParams.delete("page");
  } else {
    searchParams.set("page", String(params.page ?? 1));
  }
  searchParams.set("pageSize", String(params.pageSize));
  return searchParams.toString();
}

/** The list's search, sort and filter as a request body (an export): every row, so no page. */
export function toListQueryBody(params: ListParams): Record<string, string> {
  const query = Object.fromEntries(toListSearchParams(params));
  for (const paging of ["page", "pageSize", "after", "before", "last"]) {
    delete query[paging];
  }
  return query;
}

function readCursor(searchParams: URLSearchParams): ListCursor | null {
  const after = searchParams.get("after");
  if (after) {
    return { after };
  }
  const before = searchParams.get("before");
  if (before) {
    return { before };
  }
  return searchParams.get("last") === "true" ? { last: true } : null;
}

/** The first page of a list, unsorted and unfiltered. */
export const FIRST_PAGE: ListParams = {
  search: "",
  page: 1,
  cursor: null,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  direction: "asc",
  filter: null,
};
