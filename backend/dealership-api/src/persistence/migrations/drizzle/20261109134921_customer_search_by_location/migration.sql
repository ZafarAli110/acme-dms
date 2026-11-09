-- ACME-129: the customer search's trigram index with the location first, so a search reads only its location's matches;
-- docs/standards/database.md, "Migrations on big tables". In production build it first, without blocking saves:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_customers_search_location ON customers USING gin (...) WHERE is_deleted = false;
-- The new index comes before the old one is dropped, so the search is never without one. Written by hand: btree_gin (a
-- contrib extension, on managed Postgres too) lets a GIN index hold the location beside the trigrams.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_search_location" ON "customers" USING gin ("location_id",("first_name" || chr(31) || "surname" || chr(31) || coalesce("company_name", '') || chr(31) || coalesce("email", '')) gin_trgm_ops) WHERE "is_deleted" = false;--> statement-breakpoint
DROP INDEX IF EXISTS "ix_customers_search_text";
