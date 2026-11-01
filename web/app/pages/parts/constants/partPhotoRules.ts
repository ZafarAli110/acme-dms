/** The service's rules for part photos, checked here before anything is sent. */
export const PART_PHOTO_RULES = {
  types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
  maxBytes: 10 * 1024 * 1024,
  maxPerPart: 10,
} as const;
