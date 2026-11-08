import { describe, expect, it } from "bun:test";

import { classify } from "./load-test";

describe("classify", () => {
  it("counts the system saying busy apart from failures (ACME-121)", () => {
    expect(classify(503, JSON.stringify({ type: "urn:acme:error:busy", status: 503 }))).toBe("busy");
  });

  it("keeps every other status as its number: a database that is down, a plain 503, an error", () => {
    expect(classify(503, JSON.stringify({ type: "urn:acme:error:service-unavailable" }))).toBe("503");
    expect(classify(503, "Service Unavailable")).toBe("503");
    expect(classify(500, JSON.stringify({ type: "urn:acme:error:busy" }))).toBe("500");
    expect(classify(200, "[]")).toBe("200");
  });
});
