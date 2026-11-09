import { describe, expect, it } from "vitest";
import type { PartPhoto } from "../../types/part";
import {
  isTakingLong,
  isWorthPolling,
  msUntilTakingLong,
  PHOTO_POLL_LIMIT_MS,
  PHOTO_POLL_UNTIL_MS,
  PHOTO_SLOW_POLL_MS,
  pollIntervalMs,
} from "../photoProcessing";

let next = 0;
/** A photo with an id of its own, so each test starts its clock afresh; `createdAt` is the server's and ignored. */
const photo = (status: PartPhoto["status"], createdAt = "2026-11-07T09:00:00Z"): PartPhoto => ({
  id: `p${++next}`,
  documentId: "d1",
  originalFileName: "front.jpg",
  status,
  failureReason: null,
  isDefault: true,
  createdAt,
});

describe("photo processing", () => {
  const seenAt = 1_000_000;

  it("keeps asking about a photo being processed, until the limit from when this page first saw it", () => {
    const pending = [photo("pending")];

    expect(isWorthPolling(pending, seenAt)).toBe(true);
    expect(isWorthPolling(pending, seenAt + PHOTO_POLL_LIMIT_MS - 1)).toBe(true);
    expect(isWorthPolling(pending, seenAt + PHOTO_POLL_LIMIT_MS)).toBe(false);
  });

  it("does not trust the server's time against this browser's clock", () => {
    // A laptop whose clock runs ten minutes ahead of the server: the photo was just saved.
    const pending = [photo("pending", new Date(seenAt - 10 * 60 * 1000).toISOString())];

    expect(isWorthPolling(pending, seenAt)).toBe(true);
    expect(isTakingLong(pending, seenAt)).toBe(false);
  });

  it("says a photo is taking long once the page has stopped asking, and when that will be", () => {
    const pending = [photo("pending")];

    expect(msUntilTakingLong(pending, seenAt)).toBe(PHOTO_POLL_LIMIT_MS);
    expect(isTakingLong(pending, seenAt + PHOTO_POLL_LIMIT_MS)).toBe(true);
    expect(msUntilTakingLong(pending, seenAt + PHOTO_POLL_LIMIT_MS)).toBeNull();
  });

  it("does neither for photos that are finished", () => {
    const finished = [photo("ready"), photo("failed")];

    expect(isWorthPolling(finished, seenAt)).toBe(false);
    expect(isTakingLong(finished, seenAt + PHOTO_POLL_LIMIT_MS * 10)).toBe(false);
    expect(msUntilTakingLong(finished, seenAt)).toBeNull();
  });

  // The state sweep's F10: asking stopped at 2 minutes, but the server decides by 10.
  it("asks often, then slowly until past the server's deadline, then stops", () => {
    const pending = [photo("pending")];

    expect(pollIntervalMs(pending, seenAt)).toBe(2000);
    expect(pollIntervalMs(pending, seenAt + PHOTO_POLL_LIMIT_MS)).toBe(PHOTO_SLOW_POLL_MS);
    expect(pollIntervalMs(pending, seenAt + PHOTO_POLL_UNTIL_MS - 1)).toBe(PHOTO_SLOW_POLL_MS);
    expect(pollIntervalMs(pending, seenAt + PHOTO_POLL_UNTIL_MS)).toBe(false);
  });

  it("forgets a photo once it is no longer pending, so seeing it pending again starts afresh", () => {
    const pending = photo("pending");
    pollIntervalMs([pending], seenAt);
    pollIntervalMs([{ ...pending, status: "ready" }], seenAt + PHOTO_POLL_UNTIL_MS);

    expect(pollIntervalMs([pending], seenAt + PHOTO_POLL_UNTIL_MS + 1)).toBe(2000);
  });
});
