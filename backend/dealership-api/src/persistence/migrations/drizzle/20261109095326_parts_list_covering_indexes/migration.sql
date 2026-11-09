-- The parts list with a full catalogue (ACME-124): two covering indexes, so its count, stock value and sorts read the
-- location's stock and its parts from the indexes alone. Each holds every column the policies (`dealer_id`) and those
-- queries read; Drizzle has no INCLUDE, so it is written here by hand (the schema declares the key and the WHERE).
-- docs/standards/database.md, "Migrations on big tables": in production build them first, without blocking saves,
-- outside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_part_inventories_location_stock ON part_inventories (location_id) INCLUDE (dealer_id, part_id, bin_id, quantity_on_hand, reorder_level) WHERE NOT is_deleted;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parts_live_price ON parts (id) INCLUDE (dealer_id, unit_price, part_number) WHERE NOT is_deleted;
-- and this migration finds them.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_part_inventories_location_stock" ON "part_inventories" ("location_id") INCLUDE ("dealer_id", "part_id", "bin_id", "quantity_on_hand", "reorder_level") WHERE NOT "is_deleted";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_parts_live_price" ON "parts" ("id") INCLUDE ("dealer_id", "unit_price", "part_number") WHERE NOT "is_deleted";
