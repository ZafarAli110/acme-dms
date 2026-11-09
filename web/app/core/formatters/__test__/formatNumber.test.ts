import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { aboutValue, formatFileSize, formatListTotal, formatNumber, parseDecimal } from "../formatNumber";

describe("formatNumber", () => {
  it("groups thousands the way the user's language does", () => {
    expect(formatNumber(1600000, "en")).toBe("1,600,000");
    expect(formatNumber(1600000, "fr")).toMatch(/^1\s600\s000$/);
  });

  it("shows a list's total exact, about a number to two figures, or many (ACME-129)", () => {
    const t = ((key: string, options?: { total?: string }) =>
      key === "paging.about" ? `about ${options?.total}` : "many") as unknown as TFunction;

    expect(formatListTotal({ kind: "exact", value: 0 }, "en", t)).toBe("0");
    expect(formatListTotal({ kind: "exact", value: 1095 }, "en", t)).toBe("1,095");
    expect(formatListTotal({ kind: "about", value: 1_605_651 }, "en", t)).toBe("about 1,600,000");
    expect(formatListTotal({ kind: "about", value: 24_266 }, "en", t)).toBe("about 24,000");
    expect(formatListTotal({ kind: "many", value: null }, "en", t)).toBe("many");
    expect(aboutValue(953_203)).toBe(950_000);
    expect(aboutValue(42)).toBe(42);
  });

  it("shows a file size in megabytes with the language's decimal separator and unit", () => {
    expect(formatFileSize(13_107_200, "en")).toBe("12.5 MB");
    expect(formatFileSize(13_107_200, "fr")).toMatch(/^12,5\sMo$/);
  });
});

describe("parseDecimal", () => {
  it("reads a decimal the way the user's language writes it", () => {
    expect(parseDecimal("45,50", "fr")).toBe(45.5);
    expect(parseDecimal("1 234,50", "fr")).toBe(1234.5);
    expect(parseDecimal("1 234,50", "fr")).toBe(1234.5);
    expect(parseDecimal("45.50", "en")).toBe(45.5);
    expect(parseDecimal("1,234.50", "en")).toBe(1234.5);
  });

  it("reads a dot as the decimal point in French too, and refuses what is not a number", () => {
    expect(parseDecimal("45.50", "fr")).toBe(45.5);
    expect(parseDecimal("", "en")).toBeNull();
    expect(parseDecimal("12abc", "en")).toBeNull();
    expect(parseDecimal("1,2,3,4.5.6", "en")).toBeNull();
  });
});
