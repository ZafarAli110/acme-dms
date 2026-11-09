import { describe, expect, it } from "vitest";
import { FIRST_PAGE } from "../../../../core/paging/listParams";
import { EVERY_PART, partQuestionOf } from "../../types/part";
import { PART_QUERY_KEYS } from "../partQueryKey";

const LOCATION = "20000000-0000-0000-0000-000000000001";

// ACME-124: the parts total is asked once per question, so the pages and the sort share one count; a new search or
// filter is a new question.
describe("PART_QUERY_KEYS.count", () => {
  it("keeps one count while the page, the page size and the sort change, and Home shares the plain list's", () => {
    const first = PART_QUERY_KEYS.count(LOCATION, partQuestionOf(FIRST_PAGE));
    const later = PART_QUERY_KEYS.count(
      LOCATION,
      partQuestionOf({ ...FIRST_PAGE, page: 3, pageSize: 50, sort: "onHand", direction: "desc" }),
    );

    expect(later).toEqual(first);
    expect(PART_QUERY_KEYS.count(LOCATION, EVERY_PART)).toEqual(first);
  });

  it("asks again for a new search or a new filter, and sits under the location's key, so a save refreshes it", () => {
    const plain = PART_QUERY_KEYS.count(LOCATION, partQuestionOf(FIRST_PAGE));
    const searched = PART_QUERY_KEYS.count(LOCATION, partQuestionOf({ ...FIRST_PAGE, search: "brake pad" }));
    const filtered = PART_QUERY_KEYS.count(
      LOCATION,
      partQuestionOf({ ...FIRST_PAGE, filter: { field: "bin", operator: "startsWith", value: "A" } }),
    );

    expect(searched).not.toEqual(plain);
    expect(filtered).not.toEqual(plain);
    expect(plain.slice(0, 2)).toEqual(PART_QUERY_KEYS.all(LOCATION));
  });
});
