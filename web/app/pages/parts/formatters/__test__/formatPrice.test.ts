import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceInput, parsePrice } from "../formatPrice";

describe("formatPrice", () => {
  it("shows dollars the way the user's language writes them", () => {
    expect(formatPrice(49.99, "en")).toBe("$49.99");
    expect(formatPrice(1200, "en")).toBe("$1,200.00");
    expect(formatPrice(0, "en")).toBe("$0.00");
    // French puts the symbol after the amount, with a space before it, and groups with a space.
    expect(formatPrice(1200.5, "fr")).toMatch(/^1\s200,50\s\$$/);
  });

  it("writes a price for editing with two decimals and no symbol or grouping", () => {
    expect(formatPriceInput(1234.5, "en")).toBe("1234.50");
    expect(formatPriceInput(1234.5, "fr")).toBe("1234,50");
  });

  it("reads a typed price in the user's language: zero or more, at most two decimals", () => {
    expect(parsePrice("45,50", "fr")).toBe(45.5);
    expect(parsePrice("45.50", "en")).toBe(45.5);
    expect(parsePrice("0", "en")).toBe(0);
    expect(parsePrice("0.29", "en")).toBe(0.29);
    expect(parsePrice("45.505", "en")).toBeNull();
    expect(parsePrice("-1", "en")).toBeNull();
    expect(parsePrice("", "fr")).toBeNull();
  });
});
