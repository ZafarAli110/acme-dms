import { describe, expect, it } from "vitest";
import { escapeLike } from "../like-pattern";

describe("escapeLike", () => {
  it("makes % and _ match only themselves", () => {
    expect(escapeLike("50%_off")).toBe("50\\%\\_off");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves other text as it is", () => {
    expect(escapeLike("BRK-PAD 482913")).toBe("BRK-PAD 482913");
  });
});
