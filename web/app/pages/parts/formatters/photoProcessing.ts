import type { PartPhoto } from "../types/part";

/** How long the page asks often (every 2 s) about a photo still being processed; after that it says it is taking long. */
export const PHOTO_POLL_LIMIT_MS = 2 * 60 * 1000;
/** Then it asks every 15 s, until the server has surely decided (it fails a photo at 10 minutes), plus a minute. */
export const PHOTO_SLOW_POLL_MS = 15_000;
export const PHOTO_POLL_UNTIL_MS = 11 * 60 * 1000;

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

/** Whether some photo is still being processed and was first seen recently enough to keep asking about it often. */
export function isWorthPolling(photos: readonly PartPhoto[], nowMs: number): boolean {
  return photos.some((photo) => photo.status === "pending" && pendingFor(photo, nowMs) < PHOTO_POLL_LIMIT_MS);
}

/**
 * How often to ask about the part while a photo is processing: often at first, then slowly until the server's own
 * deadline has passed, then not at all. Stopping at 2 minutes, as before, left a photo the server finished at minute
 * 3 (or failed at 10) showing "taking long" until a reload (the state sweep's F10). A photo no longer pending is
 * forgotten, so seeing it pending again (a cached page) starts afresh.
 */
export function pollIntervalMs(photos: readonly PartPhoto[], nowMs: number): number | false {
  for (const photo of photos) {
    if (photo.status !== "pending") {
      firstSeenPending.delete(photo.id);
    }
  }
  if (isWorthPolling(photos, nowMs)) {
    return 2000;
  }
  const stillWaiting = photos.some(
    (photo) => photo.status === "pending" && pendingFor(photo, nowMs) < PHOTO_POLL_UNTIL_MS,
  );
  return stillWaiting ? PHOTO_SLOW_POLL_MS : false;
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
