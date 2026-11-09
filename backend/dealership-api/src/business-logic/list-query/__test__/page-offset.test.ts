import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MAX_LIST_DEPTH, pageOffset } from "../page-offset";

describe("pageOffset", () => {
  it("skips the rows of the pages before", () => {
    expect(pageOffset(1, 25)).toBe(0);
    expect(pageOffset(3, 25)).toBe(50);
  });

  it("reaches the last page that ends within the depth limit", () => {
    expect(pageOffset(MAX_LIST_DEPTH / 25, 25)).toBe(MAX_LIST_DEPTH - 25);
    expect(pageOffset(MAX_LIST_DEPTH / 100, 100)).toBe(MAX_LIST_DEPTH - 100);
  });

  it("refuses a deeper page with a 400 that names the last page", () => {
    expect(() => pageOffset(MAX_LIST_DEPTH / 25 + 1, 25)).toThrow(BadRequestException);
    expect(() => pageOffset(250_000, 25)).toThrow(/row 10,000 \(page 400 /);
  });
});
