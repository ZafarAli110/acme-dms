CREATE TABLE "idempotency_records" (
	"dealer_id" uuid,
	"user_id" uuid,
	"key" text,
	"fingerprint" text NOT NULL,
	"state" text NOT NULL,
	"holder" uuid NOT NULL,
	"lease_until" timestamptz NOT NULL,
	"answer" jsonb,
	"resource" text,
	"created_at" timestamptz NOT NULL,
	"expires_at" timestamptz NOT NULL,
	CONSTRAINT "pk_idempotency_records" PRIMARY KEY("dealer_id","user_id","key"),
	CONSTRAINT "ck_idempotency_records_state" CHECK ("state" in ('running', 'committed', 'done'))
);
--> statement-breakpoint
CREATE INDEX "ix_idempotency_records_expires_at" ON "idempotency_records" ("expires_at");--> statement-breakpoint
-- A user's own keys, at their dealer, at every location they work at (ACME-125): a key belongs to the user's save, not
-- to a rooftop, and a policy by location would let the same key run twice from two locations.
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "idempotency_records_owner" ON "idempotency_records" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);
