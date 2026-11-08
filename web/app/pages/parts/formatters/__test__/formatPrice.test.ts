import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceInput, parsePriceCents } from "../formatPrice";

describe("formatPrice", () => {
  it("shows pence as pounds the way the user's language writes them", () => {
    expect(formatPrice(4999, "en")).toBe("£49.99");
    expect(formatPrice(120_000, "en")).toBe("£1,200.00");
    expect(formatPrice(0, "en")).toBe("£0.00");
    expect(formatPrice(30, "en")).toBe("£0.30");
    expect(formatPrice(999_999_999_999, "en")).toBe("£9,999,999,999.99");
    // French puts the symbol after the amount, with a space before it, and groups with a space.
    expect(formatPrice(120_050, "fr")).toMatch(/^1\s200,50\s£$/);
  });

  it("writes a price for editing with two decimals and no symbol or grouping", () => {
    expect(formatPriceInput(123_450, "en")).toBe("1234.50");
    expect(formatPriceInput(123_450, "fr")).toBe("1234,50");
    expect(formatPriceInput(123_456_789, "en")).toBe("1234567.89");
  });

  it("reads a typed price into pence exactly: zero or more, at most two decimals, never rounded", () => {
    expect(parsePriceCents("45,50", "fr")).toBe(4550);
    expect(parsePriceCents("45.50", "en")).toBe(4550);
    expect(parsePriceCents("1,234,567.89", "en")).toBe(123_456_789);
    expect(parsePriceCents("1.15", "en")).toBe(115); // 1.15 * 100 is 114.99999999999999
    expect(parsePriceCents("0.1", "en")).toBe(10);
    expect(parsePriceCents("0", "en")).toBe(0);
    expect(parsePriceCents("49.999", "en")).toBeNull();
    expect(parsePriceCents("-1", "en")).toBeNull();
    expect(parsePriceCents("", "fr")).toBeNull();
  });
});
