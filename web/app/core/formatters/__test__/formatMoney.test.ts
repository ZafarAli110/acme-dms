import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, formatMoneyInput, parseMoneyCents } from "../formatMoney";

describe("formatMoney", () => {
  it("shows cents as dollars the way the user's language writes them", () => {
    expect(formatMoney(4999, "en")).toBe("$49.99");
    expect(formatMoney(120_000, "en")).toBe("$1,200.00");
    expect(formatMoney(0, "en")).toBe("$0.00");
    expect(formatMoney(30, "en")).toBe("$0.30");
    expect(formatMoney(999_999_999_999, "en")).toBe("$9,999,999,999.99");
    // French puts the symbol after the amount, with a space before it, and groups with a space.
    expect(formatMoney(120_050, "fr")).toMatch(/^1\s200,50\s\$$/);
  });

  it("writes an amount for editing with two decimals and no symbol or grouping", () => {
    expect(formatMoneyInput(123_450, "en")).toBe("1234.50");
    expect(formatMoneyInput(123_450, "fr")).toBe("1234,50");
    expect(formatMoneyInput(123_456_789, "en")).toBe("1234567.89");
  });

  it("reads a typed amount into cents exactly: zero or more, at most two decimals, never rounded", () => {
    expect(parseMoneyCents("45,50", "fr")).toBe(4550);
    expect(parseMoneyCents("45.50", "en")).toBe(4550);
    expect(parseMoneyCents("1,234,567.89", "en")).toBe(123_456_789);
    expect(parseMoneyCents("1.15", "en")).toBe(115); // 1.15 * 100 is 114.99999999999999
    expect(parseMoneyCents("0.1", "en")).toBe(10);
    expect(parseMoneyCents("0", "en")).toBe(0);
    expect(parseMoneyCents("49.999", "en")).toBeNull();
    expect(parseMoneyCents("-1", "en")).toBeNull();
    expect(parseMoneyCents("", "fr")).toBeNull();
  });

  it("puts the symbol where the language does: before in English, after in French", () => {
    expect(currencySymbol("en")).toEqual({ symbol: "$", isPrefix: true });
    expect(currencySymbol("fr")).toEqual({ symbol: "$", isPrefix: false });
  });
});
