export type SortDirection = 'asc' | 'desc';

/** The one filter a list can have, as the data grid builds it: a field, an operator and, for most operators, a value. */
export interface ListFilter {
  field: string;
  /** The grid's operator name (`contains`, `>=`, `after`, …); the API takes the same names. */
  operator: string;
  /** Text as typed, a number as text, a date as YYYY-MM-DD; null for `isEmpty` and `isNotEmpty`. */
  value: string | null;
}

/**
 * What a list page shows: the search, the page, one sort and one filter. They live in the URL, so a refresh or a shared
 * link keeps them.
 */
export interface ListParams {
  search: string;
  /** 1-based, as the API and the URL count. */
  page: number;
  pageSize: number;
  /** A field of the list, or null for the list's own order. */
  sort: string | null;
  direction: SortDirection;
  filter: ListFilter | null;
}

/** The free data grid shows at most 100 rows a page. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

/**
 * Reads a list page's params from the URL
 * (`?search=brake&page=2&pageSize=50&sort=onHand&direction=desc&filterField=bin&filterOperator=startsWith&filterValue=A`);
 * anything invalid falls back. Whether the list has that field is the API's to say.
 */
export function readListParams(searchParams: URLSearchParams): ListParams {
  const page = Number(searchParams.get('page'));
  const pageSize = Number(searchParams.get('pageSize'));
  const filterField = searchParams.get('filterField');
  const filterOperator = searchParams.get('filterOperator');
  return {
    search: searchParams.get('search') ?? '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    sort: searchParams.get('sort'),
    direction: searchParams.get('direction') === 'desc' ? 'desc' : 'asc',
    filter:
      filterField && filterOperator
        ? {field: filterField, operator: filterOperator, value: searchParams.get('filterValue')}
        : null,
  };
}

/** The params as a query string, leaving out the defaults so a plain list keeps a plain URL. */
export function toListSearchParams(params: ListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search !== '') {
    searchParams.set('search', params.search);
  }
  if (params.page !== 1) {
    searchParams.set('page', String(params.page));
  }
  if (params.pageSize !== DEFAULT_PAGE_SIZE) {
    searchParams.set('pageSize', String(params.pageSize));
  }
  if (params.sort) {
    searchParams.set('sort', params.sort);
    searchParams.set('direction', params.direction);
  }
  if (params.filter) {
    searchParams.set('filterField', params.filter.field);
    searchParams.set('filterOperator', params.filter.operator);
    if (params.filter.value !== null) {
      searchParams.set('filterValue', params.filter.value);
    }
  }
  return searchParams;
}

/** The query string the API's list endpoints take: the same names, with the page always sent. */
export function toListApiQuery(params: ListParams): string {
  const searchParams = toListSearchParams(params);
  searchParams.set('page', String(params.page));
  searchParams.set('pageSize', String(params.pageSize));
  return searchParams.toString();
}

/** The first page of a list, unsorted and unfiltered. */
export const FIRST_PAGE: ListParams = {
  search: '',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort: null,
  direction: 'asc',
  filter: null,
};
