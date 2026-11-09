import { useSearchParams } from "react-router";
import { type ListParams, readListParams, toListSearchParams } from "../paging/listParams";

/**
 * A list page's search, page, sort and filter, read from and written to the URL. A change is a navigation, so the
 * route's clientLoader runs for it. Typing a search or a filter replaces the history entry; changing page or sort adds
 * one, so Back goes to the previous view of the list. Anything but a new page starts again at page 1.
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams);

  // A change that does not say how the page was reached (a sort, a filter, a page size) leaves keyset paging: its
  // cursor belonged to the old question (ACME-129).
  const update = (changes: Partial<ListParams>, options: { replace: boolean }): void => {
    setSearchParams(toListSearchParams({ ...params, cursor: null, ...changes }), {
      replace: options.replace,
      preventScrollReset: true,
    });
  };

  return {
    params,
    update,
  };
}
