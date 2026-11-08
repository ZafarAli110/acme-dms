-- The parts search (ACME-123): the description's words, kept by Postgres, and two GIN indexes (the words; any part of a
-- part number). docs/standards/database.md, "Migrations on big tables": adding a STORED column rewrites `parts` under
-- an exclusive lock. `parts` is a catalogue (about 60,000 rows a dealer), so the rewrite takes seconds; in production
-- run it in a quiet window, and build the indexes first, without blocking saves, outside a transaction:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parts_search_words ON parts USING gin (search_words);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_parts_part_number_trigram ON parts USING gin (upper(part_number) gin_trgm_ops);
-- (the first after this column exists), and this migration finds them.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "search_words" tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, "description")) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_parts_search_words" ON "parts" USING gin ("search_words");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_parts_part_number_trigram" ON "parts" USING gin (upper("part_number") gin_trgm_ops);
