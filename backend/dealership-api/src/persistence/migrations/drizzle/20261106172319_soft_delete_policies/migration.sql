-- Soft delete as a global filter: a deleted row is never shown to a request. A restrictive policy is ANDed with the
-- dealer and location policies, so every read, join, update and delete of a request leaves out the rows marked
-- is_deleted, with no `notDeleted(...)` to remember in a handler. Marking a row deleted is refused by the same policy
-- (the changed row is no longer visible), so softDeleteAsync sets app.soft_deleting for that one statement. Code outside a request (the export worker, the consumer, the seed) works as
-- the owner, which policies do not apply to, and adds `notDeleted` itself.
CREATE POLICY "customers_not_deleted" ON "customers" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted" OR current_setting('app.soft_deleting', true) = 'on');--> statement-breakpoint
CREATE POLICY "bins_not_deleted" ON "bins" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted" OR current_setting('app.soft_deleting', true) = 'on');--> statement-breakpoint
CREATE POLICY "parts_not_deleted" ON "parts" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted" OR current_setting('app.soft_deleting', true) = 'on');--> statement-breakpoint
CREATE POLICY "part_inventories_not_deleted" ON "part_inventories" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted" OR current_setting('app.soft_deleting', true) = 'on');--> statement-breakpoint
CREATE POLICY "part_photos_not_deleted" ON "part_photos" AS RESTRICTIVE FOR SELECT TO dealership_api_user
  USING (NOT "is_deleted" OR current_setting('app.soft_deleting', true) = 'on');
