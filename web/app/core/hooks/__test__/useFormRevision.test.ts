import { describe, expect, it } from "vitest";
import { nextShownRevision } from "../useFormRevision";

describe("nextShownRevision", () => {
  const base = { shown: "v1", latest: "v2" };

  it("shows the newest version in a form with nothing to lose", () => {
    expect(nextShownRevision({ ...base, dirty: false, savedHere: false })).toBe("v2");
  });

  it("keeps the user's edits when someone else saved meanwhile", () => {
    expect(nextShownRevision({ ...base, dirty: true, savedHere: false })).toBe("v1");
  });

  it("starts again from what the user's own save stored", () => {
    expect(nextShownRevision({ ...base, dirty: true, savedHere: true })).toBe("v2");
  });
});
