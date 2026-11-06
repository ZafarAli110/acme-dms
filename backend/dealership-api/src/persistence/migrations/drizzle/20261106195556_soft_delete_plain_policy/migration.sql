-- The soft-delete policy was `NOT is_deleted OR current_setting('app.soft_deleting') = 'on'`, so that marking a row deleted
-- (an UPDATE whose new row is not visible) was allowed. The planner cannot prove that an OR with a run-time setting implies a
-- partial index's WHERE, so under the request role every partial index (the customers list's name-order index, the unique
-- indexes on live rows) was unusable and lists sorted a whole location. The policy is plain again, which it can prove;
-- softDeleteAsync does its one statement outside the request role instead.
DROP POLICY "customers_not_deleted" ON "customers";--> statement-breakpoint
DROP POLICY "bins_not_deleted" ON "bins";--> statement-breakpoint
DROP POLICY "parts_not_deleted" ON "parts";--> statement-breakpoint
DROP POLICY "part_inventories_not_deleted" ON "part_inventories";--> statement-breakpoint
DROP POLICY "part_photos_not_deleted" ON "part_photos";--> statement-breakpoint
CREATE POLICY "customers_not_deleted" ON "customers" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted");--> statement-breakpoint
CREATE POLICY "bins_not_deleted" ON "bins" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted");--> statement-breakpoint
CREATE POLICY "parts_not_deleted" ON "parts" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted");--> statement-breakpoint
CREATE POLICY "part_inventories_not_deleted" ON "part_inventories" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted");--> statement-breakpoint
CREATE POLICY "part_photos_not_deleted" ON "part_photos" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted");
