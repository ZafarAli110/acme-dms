-- The state sweep's F7: "no export worker took it" counts from when a job last became queued (made, or taken back from a
-- worker that stopped), not from when it was made. A small table: added empty, filled from created_at, then required.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "export_jobs" ADD COLUMN IF NOT EXISTS "queued_at" timestamptz;--> statement-breakpoint
UPDATE "export_jobs" SET "queued_at" = "created_at" WHERE "queued_at" IS NULL;--> statement-breakpoint
ALTER TABLE "export_jobs" ALTER COLUMN "queued_at" SET NOT NULL;
