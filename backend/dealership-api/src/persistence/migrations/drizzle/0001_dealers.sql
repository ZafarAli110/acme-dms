-- Every dealer now shares this database, so every business row says whose it is. Rows saved before this migration
-- belong to Northwind Motors, the only dealer until now (identity-api's DemoData.NorthwindMotors); the default fills
-- them in and is dropped straight after, so a new row must always name its dealer.
DROP INDEX "uq_parts_part_number";--> statement-breakpoint
ALTER TABLE "bins" ADD COLUMN "dealer_id" uuid NOT NULL DEFAULT '10000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "bins" ALTER COLUMN "dealer_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "dealer_id" uuid NOT NULL DEFAULT '10000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "dealer_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "part_inventories" ADD COLUMN "dealer_id" uuid NOT NULL DEFAULT '10000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "part_inventories" ALTER COLUMN "dealer_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "part_photos" ADD COLUMN "dealer_id" uuid NOT NULL DEFAULT '10000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "part_photos" ALTER COLUMN "dealer_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "dealer_id" uuid NOT NULL DEFAULT '10000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "parts" ALTER COLUMN "dealer_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_parts_dealer_part_number" ON "parts" USING btree ("dealer_id","part_number") WHERE NOT "parts"."is_deleted";
