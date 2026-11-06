import { describe, expect, it } from "vitest";
import { formatPrice } from "../formatPrice";

describe("formatPrice", () => {
  it("shows pounds the way the user's language writes them", () => {
    expect(formatPrice(49.99, "en-GB")).toBe("£49.99");
    // French puts the symbol after the amount, with a narrow space before it.
    expect(formatPrice(49.99, "fr")).toMatch(/^49,99\s£$/);
  });

  it("shows zero and whole amounts with their pence", () => {
    expect(formatPrice(0, "en-GB")).toBe("£0.00");
    expect(formatPrice(1200, "en-GB")).toBe("£1,200.00");
  });
});
