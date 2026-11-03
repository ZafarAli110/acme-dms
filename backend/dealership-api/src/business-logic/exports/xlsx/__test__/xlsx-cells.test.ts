import { describe, expect, it } from "vitest";
import { escapeXml, textCell } from "../xlsx-cells";

describe("escapeXml", () => {
  it("writes the characters XML gives a meaning to as entities", () => {
    expect(escapeXml(`Smith & "Sons" <Ltd>`)).toBe("Smith &amp; &quot;Sons&quot; &lt;Ltd&gt;");
  });

  it("drops control characters XML cannot hold, keeping tab and line breaks", () => {
    expect(escapeXml("Smith\u000BJones\u0000\tA\nB\rC")).toBe("SmithJones\tA\nB\rC");
    expect(escapeXml("x\uFFFEy\uFFFF")).toBe("xy");
  });

  it("turns a broken surrogate pair into the replacement character, and keeps a whole one", () => {
    expect(escapeXml("Ann \uD83D")).toBe("Ann �");
    expect(escapeXml("Ann 😀")).toBe("Ann 😀");
  });
});

describe("textCell", () => {
  it("is an inline text cell, which Excel shows as text even when it starts with =", () => {
    expect(textCell("=1+1")).toBe('<c t="inlineStr"><is><t>=1+1</t></is></c>');
  });
});
