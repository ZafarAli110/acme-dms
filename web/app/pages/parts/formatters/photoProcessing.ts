import type { PartPhoto } from "../types/part";

/** How long the page keeps asking about a photo still being processed; after that it says so and stops. */
export const PHOTO_POLL_LIMIT_MS = 2 * 60 * 1000;

/**
 * When this page first saw each photo still processing, by the browser's own clock: the limit is measured from there,
 * never by comparing the server's `createdAt` with a laptop's clock, which may be minutes out. A reload starts again.
 */
const firstSeenPending = new Map<string, number>();

function pendingFor(photo: PartPhoto, nowMs: number): number {
  const seen = firstSeenPending.get(photo.id) ?? nowMs;
  firstSeenPending.set(photo.id, seen);
  return nowMs - seen;
}

/** Whether some photo is still being processed and was first seen recently enough to keep asking about it. */
export function isWorthPolling(photos: readonly PartPhoto[], nowMs: number): boolean {
  return photos.some((photo) => photo.status === "pending" && pendingFor(photo, nowMs) < PHOTO_POLL_LIMIT_MS);
}

/** Whether some photo has been processing for longer than the page waits: the page stops asking and says so. */
export function isTakingLong(photos: readonly PartPhoto[], nowMs: number): boolean {
  return photos.some((photo) => photo.status === "pending" && pendingFor(photo, nowMs) >= PHOTO_POLL_LIMIT_MS);
}

/** How long until the first photo still processing reaches the limit; null when none will. */
export function msUntilTakingLong(photos: readonly PartPhoto[], nowMs: number): number | null {
  const waits = photos
    .filter((photo) => photo.status === "pending")
    .map((photo) => PHOTO_POLL_LIMIT_MS - pendingFor(photo, nowMs))
    .filter((wait) => wait > 0);
  return waits.length === 0 ? null : Math.min(...waits);
}
