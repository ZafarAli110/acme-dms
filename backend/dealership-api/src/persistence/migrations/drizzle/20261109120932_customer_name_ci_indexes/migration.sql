-- ACME-129: a close spelling's customers by their whole surname or first name, case ignored, in name order;
-- docs/standards/database.md, "Migrations on big tables". In production build each first, without blocking saves:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_customers_surname_ci ON customers (...) WHERE is_deleted = false;
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_surname_ci" ON "customers" ("dealer_id","location_id",lower("surname"),"surname","first_name","id") WHERE "is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_customers_first_name_ci" ON "customers" ("dealer_id","location_id",lower("first_name"),"surname","first_name","id") WHERE "is_deleted" = false;