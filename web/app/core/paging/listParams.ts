/** What a list page shows: the search and the page. They live in the URL, so a refresh or a shared link keeps them. */
export interface ListParams {
  search: string;
  /** 1-based, as the API and the URL count. */
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

/** Reads a list page's params from the URL (`?search=brake&page=2&pageSize=50`); anything invalid falls back. */
export function readListParams(searchParams: URLSearchParams): ListParams {
  const page = Number(searchParams.get('page'));
  const pageSize = Number(searchParams.get('pageSize'));
  return {
    search: searchParams.get('search') ?? '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  };
}

/** The URL for the params, leaving out the defaults so a plain list keeps a plain URL. */
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
  return searchParams;
}
