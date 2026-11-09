import { describe, expect, it } from "vitest";
import { nextSaveKey } from "../useSaveKey";

const makeKey = (): string => "new-key";

describe("nextSaveKey", () => {
  it("keeps the key while no save has been answered", () => {
    expect(nextSaveKey("first-key", null, makeKey)).toBe("first-key");
  });

  it("keeps the key after a save that was not done (no answer, refused, busy): saving again is the same save", () => {
    expect(nextSaveKey("first-key", { saved: false }, makeKey)).toBe("first-key");
  });

  it("starts a new key once a save is done, so the next change is a save of its own", () => {
    expect(nextSaveKey("first-key", { saved: true }, makeKey)).toBe("new-key");
  });
});
