import { describe, expect, it } from "vitest";
import { en } from "../catalogs/en";
import { fr } from "../catalogs/fr";
import { englishMessage, fillPlaceholders } from "../messages";

/** Every message of a catalog, by its dotted key. */
function flatten(catalog: object, prefix = ""): Map<string, string> {
  const messages = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      messages.set(path, value);
    } else {
      for (const [inner, message] of flatten(value as object, path)) {
        messages.set(inner, message);
      }
    }
  }
  return messages;
}

const placeholders = (message: string): string[] =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").toSorted();

describe("catalogs", () => {
  it("has every English message in French, with the same placeholders and some text", () => {
    const english = flatten(en);
    const french = flatten(fr);

    expect([...french.keys()].toSorted()).toEqual([...english.keys()].toSorted());
    for (const [key, message] of english) {
      const translation = french.get(key) ?? "";
      expect(translation, key).not.toBe("");
      expect(placeholders(translation), key).toEqual(placeholders(message));
    }
  });

  it("fills placeholders, names a field as its screen does, writes a number as the language does, and leaves an unknown one as it is", () => {
    expect(englishMessage("errors.customerNotFound", { customerId: "c-1" })).toBe(
      "Customer c-1 was not found at this location.",
    );
    expect(fillPlaceholders(fr.validation.isNotEmpty, { property: "surname" }, "fr")).toBe("Nom est obligatoire.");
    expect(fillPlaceholders(en.validation.isNotEmpty, { property: "nickname" }, "en")).toBe("nickname is required.");
    expect(fillPlaceholders(en.validation.isNotEmpty, {}, "en")).toBe("{property} is required.");
    // A number as each language writes it: the deepest row of a page by number (ACME-129).
    expect(fillPlaceholders("{max}", { max: 10000 }, "en")).toBe("10,000");
    expect(fillPlaceholders("{max}", { max: 10000 }, "fr")).toBe("10\u202f000");
  });
});
