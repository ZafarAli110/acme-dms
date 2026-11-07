-- Two defaults could be saved before this index existed: keep each part's earliest, so the index can be created.
UPDATE "part_photos" p SET "is_default" = false
WHERE p."is_default" AND NOT p."is_deleted" AND EXISTS (
  SELECT 1 FROM "part_photos" o
  WHERE o."part_id" = p."part_id" AND o."is_default" AND NOT o."is_deleted" AND (o."created_at", o."id") < (p."created_at", p."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_part_photos_default" ON "part_photos" ("part_id") WHERE "is_default" AND NOT "is_deleted";