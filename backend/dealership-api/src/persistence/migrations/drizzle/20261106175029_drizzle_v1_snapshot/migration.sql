-- Drizzle Kit 1.0 writes the text of an index's WHERE and of a CHECK without the table name (`"is_deleted"`, not
-- `"parts"."is_deleted"`), so it saw every such index and check as changed. They are the same: this migration does
-- nothing and exists to record the snapshot in the new form, so the next `db:generate` reports only real changes.
SELECT 1;
