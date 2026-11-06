import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LIST_DEPTH, readListParams } from "../listParams";

const read = (query: string) => readListParams(new URLSearchParams(query));

describe("readListParams", () => {
  it("reads the page, the size, the search, the sort and the filter from the URL", () => {
    expect(
      read(
        "search=brake&page=2&pageSize=50&sort=onHand&direction=desc&filterField=bin&filterOperator=startsWith&filterValue=A",
      ),
    ).toEqual({
      search: "brake",
      page: 2,
      pageSize: 50,
      sort: "onHand",
      direction: "desc",
      filter: { field: "bin", operator: "startsWith", value: "A" },
    });
  });

  it("falls back for what is not valid: a page that is not a whole number from 1, a size the grid does not offer", () => {
    for (const page of ["0", "-3", "1.5", "abc", ""]) {
      expect(read(`page=${page}`).page).toBe(1);
    }
    expect(read("pageSize=7").pageSize).toBe(25);
    expect(read("pageSize=1000").pageSize).toBe(25);
  });

  it("opens a shared link to a page the API would refuse on the last page it allows", () => {
    expect(read("page=101&pageSize=100").page).toBe(100);
    expect(read("page=400&pageSize=25").page).toBe(400);
    expect(read("page=401&pageSize=25").page).toBe(400);
    expect(read("page=1001&pageSize=10").page).toBe(1000);
  });
});

describe("MAX_LIST_DEPTH", () => {
  it("is the API's limit: the grid never offers a page the API refuses, nor hides one it serves", () => {
    const api = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "..",
        "..",
        "backend",
        "dealership-api",
        "src",
        "business-logic",
        "list-query",
        "page-offset.ts",
      ),
      "utf8",
    );
    const limit = /export const MAX_LIST_DEPTH = ([\d_]+);/.exec(api)?.[1];

    expect(Number(limit?.replaceAll("_", ""))).toBe(MAX_LIST_DEPTH);
  });
});
