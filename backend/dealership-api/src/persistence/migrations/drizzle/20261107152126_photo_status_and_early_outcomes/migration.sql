CREATE TABLE "early_document_outcomes" (
	"document_id" uuid PRIMARY KEY,
	"dealer_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"failure_reason" varchar(1000),
	"received_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_photos" ADD CONSTRAINT "ck_part_photos_status" CHECK ("status" in ('pending', 'ready', 'failed'));--> statement-breakpoint
-- An early outcome belongs to a dealer, as the photo it waits for: a request sees only its own dealer's. The consumer
-- writes it as the table owner, outside any request.
ALTER TABLE "early_document_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "early_document_outcomes_dealer" ON "early_document_outcomes" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid);
