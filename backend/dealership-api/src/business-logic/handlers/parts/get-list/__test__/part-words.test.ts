import { describe, expect, it } from "vitest";
import { toPartWordsQuery } from "../part-words";

describe("toPartWordsQuery", () => {
  it("asks for every word, each as the beginning of a word", () => {
    expect(toPartWordsQuery("brak pads fr")).toBe("'brak':* & 'pads':* & 'fr':*");
  });

  it("splits a part number's pieces into words", () => {
    expect(toPartWordsQuery("BRK-PAD")).toBe("'BRK':* & 'PAD':*");
  });

  it("keeps letters beyond English and digits", () => {
    expect(toPartWordsQuery("Bremsbeläge 22in")).toBe("'Bremsbeläge':* & '22in':*");
  });

  it("never lets the query syntax through: quotes, operators and wildcards are dropped", () => {
    expect(toPartWordsQuery("pad' | !brake & (disc):* <-> 'x")).toBe("'pad':* & 'brake':* & 'disc':* & 'x':*");
  });

  it("gives nothing to search by for punctuation alone", () => {
    expect(toPartWordsQuery("--")).toBeNull();
    expect(toPartWordsQuery("   ")).toBeNull();
  });
});
