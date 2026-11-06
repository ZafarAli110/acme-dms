-- Row-level security: Postgres itself keeps every request to its dealer, its location and, for exports, its user, so
-- a query that forgets a filter returns nothing it should not. A request's transaction works as dealership_api_user
-- with app.dealer_id, app.location_id and app.user_id set (UnitOfWorkFactory); everything else (the export worker,
-- the consumer, migrations, the seed) works as the tables' owner, which the policies do not apply to.
-- A setting that is missing or empty is NULL, which matches no row: a request without a location sees no
-- location-scoped rows at all.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dealership_api_user') THEN
    CREATE ROLE dealership_api_user NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT dealership_api_user TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO dealership_api_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dealership_api_user;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dealership_api_user;--> statement-breakpoint

-- Location-scoped: one dealer's rows at one location.
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customers_dealer_location" ON "customers" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "bins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "bins_dealer_location" ON "bins" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "part_inventories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "part_inventories_dealer_location" ON "part_inventories" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid);--> statement-breakpoint

-- A user's own exports, at their dealer and location.
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "export_jobs_owner" ON "export_jobs" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid
    AND "owner_id" = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid
    AND "owner_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint

-- Dealer-scoped: the parts catalogue and its photos are shared by the dealer's locations.
ALTER TABLE "parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "parts_dealer" ON "parts" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "part_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "part_photos_dealer" ON "part_photos" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid);--> statement-breakpoint

-- processed_messages has no dealer: the consumer's own bookkeeping, no policy.

-- An export's place in line counts every queued export, whoever's: only the number leaves this function, which runs
-- as its owner so the policies above do not hide the other dealers' exports from the count.
CREATE FUNCTION export_queue_position(job_created_at timestamptz, job_id uuid) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT count(*) + 1 FROM export_jobs
    WHERE status = 'queued' AND (created_at < job_created_at OR (created_at = job_created_at AND id < job_id))
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION export_queue_position(timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION export_queue_position(timestamptz, uuid) TO dealership_api_user;
