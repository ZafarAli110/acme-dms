import { describe, expect, it } from "vitest";
import { centsFromDecimalText, decimalTextFromCents } from "#persistence/schema/columns/money-column";
import { rateOfCents, roundHalfAwayFromZero, splitCents, sumCents, timesCents } from "../money";

describe("money in whole pence", () => {
  it("reads and writes pounds by text, where multiplying by 100 goes wrong", () => {
    expect(1.005 * 100).not.toBe(100.5);
    expect(centsFromDecimalText("1.005".slice(0, 4))).toBe(100);
    expect(centsFromDecimalText("45.50")).toBe(4550);
    expect(centsFromDecimalText("0.1")).toBe(10);
    expect(centsFromDecimalText("1234567.89")).toBe(123_456_789);
    expect(centsFromDecimalText("-3")).toBe(-300);
    expect(decimalTextFromCents(4550)).toBe("45.50");
    expect(decimalTextFromCents(5)).toBe("0.05");
    expect(decimalTextFromCents(-5)).toBe("-0.05");
    expect(decimalTextFromCents(999_999_999_999)).toBe("9999999999.99");
  });

  it("refuses anything that is not two decimals at most, or not whole pence", () => {
    expect(() => centsFromDecimalText("1.234")).toThrow();
    expect(() => centsFromDecimalText("abc")).toThrow();
    expect(() => decimalTextFromCents(10.5)).toThrow();
  });

  it("multiplies and adds exactly where floats drift", () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(timesCents(10, 3)).toBe(30);
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 1000 }, () => 10))).toBe(10_000);
    expect(() => timesCents(10, 1.5)).toThrow();
  });

  it("rounds a rate once, half away from zero, the same for a refund as for a sale", () => {
    expect(Math.round(-2.5)).toBe(-2);
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(rateOfCents(99, 2000)).toBe(20); // 20% of 99p is 19.8p
    expect(rateOfCents(-99, 2000)).toBe(-20);
    expect(rateOfCents(125, 2000)).toBe(25);
    expect(rateOfCents(1250, 625)).toBe(78); // 6.25% of £12.50 is 78.125p
  });

  it("splits without losing a penny", () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(-1000, 3)).toEqual([-334, -333, -333]);
    expect(sumCents(splitCents(1001, 7))).toBe(1001);
    expect(() => splitCents(1000, 0)).toThrow();
  });
});
