import { localized } from "#i18n/messages";
import { BadRequestException } from "@nestjs/common";

/**
 * How many rows deep a list page can reach: page × page size. Postgres cannot jump to a page; it reads and drops every
 * row before it, so the cost grows with the page number (at 1.6 million customers, page 60,000 took 2.3 s on every
 * click, page 400 about 14 ms). Someone who needs row 500,000 needs a search, a filter or the export, not page 20,000.
 */
export const MAX_LIST_DEPTH = 10_000;

/**
 * The rows to skip for `page`, or a 400 when the page lies deeper than a list can reach.
 */
export function pageOffset(page: number, pageSize: number): number {
  if (page * pageSize > MAX_LIST_DEPTH) {
    throw new BadRequestException(
      localized("errors.listPageTooDeep", {
        max: MAX_LIST_DEPTH.toLocaleString("en-GB"),
        lastPage: Math.floor(MAX_LIST_DEPTH / pageSize),
      }),
    );
  }
  return (page - 1) * pageSize;
}
