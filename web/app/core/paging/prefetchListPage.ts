import { redirect } from "react-router";
import { isTransientError } from "../config/apiErrors";
import { type ListParams, readListParams } from "./listParams";

/** The address without its `page` and cursor: the list's first page, with the same search, sort and filter. */
export function withoutPage(requestUrl: string): string {
  const url = new URL(requestUrl);
  for (const paging of ["page", "after", "before", "last"]) {
    url.searchParams.delete(paging);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * A list route's clientLoader work: fetches the page the URL asks for, so the grid has it when it shows. A failure is
 * not the loader's to show (the page's own query shows it above the grid), with one exception: no answer or a timeout
 * on page 2 or later is most likely a stale link or a service that is briefly down, so it goes to page 1 instead of
 * leaving the person on an empty page they cannot get out of.
 */
export async function prefetchListPage(
  request: Request,
  fetchPage: (params: ListParams) => Promise<unknown>,
): Promise<null> {
  const params = readListParams(new URL(request.url).searchParams);
  try {
    await fetchPage(params);
  } catch (error) {
    if (isTransientError(error) && (params.page !== 1 || params.cursor)) {
      throw redirect(withoutPage(request.url));
    }
  }
  return null;
}
