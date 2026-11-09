-- ACME-129: an index for every sort the customer grid offers, the phone by the start or the end of its digits, and the
-- search text without the phone; docs/standards/database.md, "Migrations on big tables". In production build each
-- index first, without blocking saves, then this migration finds them:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_customers_sort_email ON customers (...) WHERE is_deleted = false;
-- (and the same for the others), outside a transaction. ix_customers_search (with the phone) stays until the release
-- after this one: the version before still searches through it while a deploy rolls out.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_search_text" ON "customers" USING gin (("first_name" || chr(31) || "surname" || chr(31) || coalesce("company_name", '') || chr(31) || coalesce("email", '')) gin_trgm_ops) WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_phone_start" ON "customers" ("dealer_id","location_id",(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g')) text_pattern_ops) WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_phone_end" ON "customers" ("dealer_id","location_id",(reverse(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'))) text_pattern_ops) WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_sort_company_name" ON "customers" ("dealer_id","location_id","company_name","id") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_sort_email" ON "customers" ("dealer_id","location_id","email","id") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_sort_phone" ON "customers" ("dealer_id","location_id","phone","id") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_sort_city" ON "customers" ("dealer_id","location_id","city","id") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_sort_status" ON "customers" ("dealer_id","location_id","status","id") WHERE "is_deleted" = false;--> statement-breakpoint
-- Written by hand: Drizzle has no CREATE STATISTICS. The planner multiplies the selectivities of the dealer, the
-- location and the status as if they were independent; a location belongs to one dealer, so the "about" total
-- (ACME-129) would come out far too small at a big location. Dependencies tell it they move together.
CREATE STATISTICS IF NOT EXISTS "st_customers_scope" (dependencies, ndistinct) ON "dealer_id", "location_id", "status" FROM "customers";--> statement-breakpoint
ANALYZE "customers";
