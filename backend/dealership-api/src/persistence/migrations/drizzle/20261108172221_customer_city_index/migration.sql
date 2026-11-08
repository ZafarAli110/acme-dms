-- A city filter finds a city's customers without reading the location's whole index (ACME-117); docs/standards/
-- database.md, "Migrations on big tables". In production build it first, without blocking saves, then this migration
-- finds it:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_customers_by_city ON customers (dealer_id, location_id, lower(city),
--   surname, first_name, id) WHERE is_deleted = false;
-- outside a transaction.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_by_city" ON "customers" ("dealer_id","location_id",lower("city"),"surname","first_name","id") WHERE "is_deleted" = false;
