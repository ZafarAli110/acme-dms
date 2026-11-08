-- The customer list stays quick at a location with millions of customers (ACME-110); docs/standards/database.md,
-- "Migrations on big tables". In production build these first, without blocking saves, then this migration finds them:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_customers_list_by_name ON customers (...) WHERE is_deleted = false;
-- (and the same for the other two), outside a transaction. The new indexes come before the old ones are dropped, so the
-- list is never without one.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_list_by_name" ON "customers" ("dealer_id","location_id","surname","first_name","id","status","city","last_contact_date") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_list_by_last_contact" ON "customers" ("dealer_id","location_id","last_contact_date","id","status","city","surname","first_name") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_search" ON "customers" USING gin (("first_name" || chr(31) || "surname" || chr(31) || coalesce("company_name", '') || chr(31) || coalesce("email", '') || chr(31) || coalesce("phone", '')) gin_trgm_ops) WHERE "is_deleted" = false;--> statement-breakpoint
DROP INDEX IF EXISTS "ix_customers_location";--> statement-breakpoint
DROP INDEX IF EXISTS "ix_customers_location_name";
