CREATE TABLE "early_document_outcomes" (
	"document_id" uuid PRIMARY KEY,
	"dealer_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"failure_reason" varchar(1000),
	"received_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_photos" ADD CONSTRAINT "ck_part_photos_status" CHECK ("status" in ('pending', 'ready', 'failed'));