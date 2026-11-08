import { describe, expect, it } from "vitest";
import { FIRST_PAGE } from "../../../../core/paging/listParams";
import { questionOf } from "../../types/customer";
import { CUSTOMER_QUERY_KEYS } from "../customerQueryKey";

const LOCATION = "20000000-0000-0000-0000-000000000001";

// ACME-117: the total is asked once per question, so the pages and the sort share one count; a new search or filter
// is a new question.
describe("CUSTOMER_QUERY_KEYS.count", () => {
  it("keeps one count while the page, the page size and the sort change", () => {
    const first = CUSTOMER_QUERY_KEYS.count(LOCATION, questionOf(FIRST_PAGE));
    const later = CUSTOMER_QUERY_KEYS.count(
      LOCATION,
      questionOf({ ...FIRST_PAGE, page: 7, pageSize: 50, sort: "lastContactDate", direction: "desc" }),
    );

    expect(later).toEqual(first);
  });

  it("asks again for a new search or a new filter, and sits under the location's key, so a save refreshes it", () => {
    const plain = CUSTOMER_QUERY_KEYS.count(LOCATION, questionOf(FIRST_PAGE));
    const searched = CUSTOMER_QUERY_KEYS.count(LOCATION, questionOf({ ...FIRST_PAGE, search: "penwood" }));
    const filtered = CUSTOMER_QUERY_KEYS.count(
      LOCATION,
      questionOf({ ...FIRST_PAGE, filter: { field: "city", operator: "equals", value: "York" } }),
    );

    expect(searched).not.toEqual(plain);
    expect(filtered).not.toEqual(plain);
    expect(plain.slice(0, 2)).toEqual(CUSTOMER_QUERY_KEYS.all(LOCATION));
  });
});
