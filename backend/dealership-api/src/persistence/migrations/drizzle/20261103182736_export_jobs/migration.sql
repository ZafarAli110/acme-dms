-- The export queue: exports wait, run and expire as rows here, so the API and the export worker (a process of its
-- own) share them, and a restart of either loses nothing. An operational table: no audit columns, no soft delete.
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request" jsonb NOT NULL,
	"file_name" text NOT NULL,
	"fingerprint" text NOT NULL,
	"idempotency_key" text,
	"status" text NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"total_rows" integer,
	"file_path" text,
	"file_bytes" bigint,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"worker_id" text,
	"cancel_requested_at" timestamptz,
	"created_at" timestamptz NOT NULL,
	"started_at" timestamptz,
	"first_row_at" timestamptz,
	"heartbeat_at" timestamptz,
	"finished_at" timestamptz,
	"expires_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_export_jobs_owner_idempotency_key" ON "export_jobs" USING btree ("owner_id","idempotency_key") WHERE "export_jobs"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_export_jobs_status_created" ON "export_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ix_export_jobs_dealer_status" ON "export_jobs" USING btree ("dealer_id","status");