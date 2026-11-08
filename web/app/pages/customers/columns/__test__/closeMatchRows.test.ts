import { describe, expect, it } from "vitest";
import type { CustomerPageItem } from "../../types/customer";
import { withCloseMatchRows } from "../closeMatchRows";

function customer(id: string, match: "exact" | "close"): CustomerPageItem {
  return {
    id,
    firstName: "Test",
    surname: id,
    companyName: null,
    email: null,
    phone: null,
    city: null,
    status: "active",
    lastContactDate: null,
    match,
  };
}

// ACME-120 (design a.html): exact matches, then a "Did you mean" divider, then close spellings; a note when nothing
// matched exactly.
describe("withCloseMatchRows", () => {
  it("puts the divider before the first close row", () => {
    const rows = withCloseMatchRows([customer("A", "exact"), customer("B", "close"), customer("C", "close")]);

    expect(rows.map((row) => ("kind" in row ? row.kind : row.id))).toEqual(["A", "divider", "B", "C"]);
  });

  it("starts with the note when nothing matched exactly", () => {
    const rows = withCloseMatchRows([customer("B", "close")]);

    expect(rows.map((row) => ("kind" in row ? row.kind : row.id))).toEqual(["note", "divider", "B"]);
  });

  it("adds nothing when every row is exact, or there are none", () => {
    expect(withCloseMatchRows([customer("A", "exact")]).map((row) => row.id)).toEqual(["A"]);
    expect(withCloseMatchRows([])).toEqual([]);
  });
});
