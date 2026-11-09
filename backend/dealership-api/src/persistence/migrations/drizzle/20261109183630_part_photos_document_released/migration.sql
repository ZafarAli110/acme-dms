-- The state sweep's F8: a removed photo's document that the save could not delete is handed to document-api by the photo
-- sweep. Empty for every photo so far: photos removed before this are handed over once too (at most 200 a sweep), and
-- document-api skips a document already deleted, so that costs nothing but a message each.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "part_photos" ADD COLUMN IF NOT EXISTS "document_released_at" timestamptz;
