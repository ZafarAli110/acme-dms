import type { PartPhoto } from "../types/part";

/** How long the page keeps asking about a photo still being processed; after that it says so and stops. */
export const PHOTO_POLL_LIMIT_MS = 2 * 60 * 1000;

/** Whether some photo is still being processed and was saved recently enough to keep asking about it. */
export function isWorthPolling(photos: readonly PartPhoto[], nowMs: number): boolean {
  return photos.some(
    (photo) => photo.status === "pending" && nowMs - Date.parse(photo.createdAt) < PHOTO_POLL_LIMIT_MS,
  );
}

/** Whether some photo has been processing for longer than the page waits: the page stops asking and says so. */
export function isTakingLong(photos: readonly PartPhoto[], nowMs: number): boolean {
  return photos.some(
    (photo) => photo.status === "pending" && nowMs - Date.parse(photo.createdAt) >= PHOTO_POLL_LIMIT_MS,
  );
}

/** How long until the first photo still processing reaches the limit; null when none will. */
export function msUntilTakingLong(photos: readonly PartPhoto[], nowMs: number): number | null {
  const waits = photos
    .filter((photo) => photo.status === "pending")
    .map((photo) => Date.parse(photo.createdAt) + PHOTO_POLL_LIMIT_MS - nowMs)
    .filter((wait) => wait > 0);
  return waits.length === 0 ? null : Math.min(...waits);
}
