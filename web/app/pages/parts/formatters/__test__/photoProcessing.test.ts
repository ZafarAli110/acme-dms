import { describe, expect, it } from "vitest";
import type { PartPhoto } from "../../types/part";
import { isTakingLong, isWorthPolling, msUntilTakingLong, PHOTO_POLL_LIMIT_MS } from "../photoProcessing";

const savedAt = Date.parse("2026-11-07T09:00:00Z");
const photo = (status: PartPhoto["status"]): PartPhoto => ({
  id: "p1",
  documentId: "d1",
  originalFileName: "front.jpg",
  status,
  failureReason: null,
  isDefault: true,
  createdAt: new Date(savedAt).toISOString(),
});

describe("photo processing", () => {
  it("keeps asking about a photo being processed, until the limit", () => {
    expect(isWorthPolling([photo("pending")], savedAt + 1000)).toBe(true);
    expect(isWorthPolling([photo("pending")], savedAt + PHOTO_POLL_LIMIT_MS)).toBe(false);
  });

  it("says a photo is taking long once the page has stopped asking", () => {
    expect(isTakingLong([photo("pending")], savedAt + PHOTO_POLL_LIMIT_MS - 1)).toBe(false);
    expect(isTakingLong([photo("pending")], savedAt + PHOTO_POLL_LIMIT_MS)).toBe(true);
  });

  it("does neither for photos that are finished", () => {
    const finished = [photo("ready"), photo("failed")];
    expect(isWorthPolling(finished, savedAt)).toBe(false);
    expect(isTakingLong(finished, savedAt + PHOTO_POLL_LIMIT_MS * 10)).toBe(false);
  });

  it("says when the page should look again: when the first photo still processing reaches the limit", () => {
    expect(msUntilTakingLong([photo("pending")], savedAt + 1000)).toBe(PHOTO_POLL_LIMIT_MS - 1000);
    expect(msUntilTakingLong([photo("pending")], savedAt + PHOTO_POLL_LIMIT_MS)).toBeNull();
    expect(msUntilTakingLong([photo("ready")], savedAt)).toBeNull();
  });
});
