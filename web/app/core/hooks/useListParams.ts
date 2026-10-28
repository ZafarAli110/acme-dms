import {useSearchParams} from 'react-router';
import {type ListParams, readListParams, toListSearchParams} from '../paging/listParams';

/**
 * A list page's search and page, read from and written to the URL. A change is a navigation, so the route's
 * clientLoader runs for it. Typing a search replaces the history entry; changing page adds one, so Back goes to the
 * previous page of results.
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams);

  function update(changes: Partial<ListParams>, options: {replace: boolean}): void {
    setSearchParams(toListSearchParams({...params, ...changes}), {replace: options.replace, preventScrollReset: true});
  }

  return {
    params,
    setSearch: (search: string) => update({search, page: 1}, {replace: true}),
    setPage: (page: number) => update({page}, {replace: false}),
    setPageSize: (pageSize: number) => update({pageSize, page: 1}, {replace: false}),
  };
}
