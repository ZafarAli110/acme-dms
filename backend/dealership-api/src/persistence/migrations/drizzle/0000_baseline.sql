CREATE TABLE "bins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" varchar(100) NOT NULL,
	"created_at" timestamptz NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamptz NOT NULL,
	"updated_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamptz,
	"deleted_by" uuid,
	CONSTRAINT "ck_bins_deleted" CHECK ("bins"."is_deleted" = ("bins"."deleted_at" IS NOT NULL) AND "bins"."is_deleted" = ("bins"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"location_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"surname" varchar(100) NOT NULL,
	"company_name" varchar(200),
	"email" varchar(254),
	"phone" varchar(40),
	"city" varchar(100),
	"status" varchar(20) NOT NULL,
	"last_contact_date" date,
	"created_at" timestamptz NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamptz NOT NULL,
	"updated_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamptz,
	"deleted_by" uuid,
	CONSTRAINT "ck_customers_deleted" CHECK ("customers"."is_deleted" = ("customers"."deleted_at" IS NOT NULL) AND "customers"."is_deleted" = ("customers"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "part_inventories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"location_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"bin_id" uuid NOT NULL,
	"quantity_on_hand" integer NOT NULL,
	"reorder_level" integer NOT NULL,
	"created_at" timestamptz NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamptz NOT NULL,
	"updated_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamptz,
	"deleted_by" uuid,
	CONSTRAINT "ck_part_inventories_deleted" CHECK ("part_inventories"."is_deleted" = ("part_inventories"."deleted_at" IS NOT NULL) AND "part_inventories"."is_deleted" = ("part_inventories"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "part_photos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"part_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"failure_reason" varchar(1000),
	"is_default" boolean NOT NULL,
	"created_at" timestamptz NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamptz NOT NULL,
	"updated_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamptz,
	"deleted_by" uuid,
	CONSTRAINT "part_photos_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "ck_part_photos_deleted" CHECK ("part_photos"."is_deleted" = ("part_photos"."deleted_at" IS NOT NULL) AND "part_photos"."is_deleted" = ("part_photos"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"part_number" varchar(50) NOT NULL,
	"description" varchar(500) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"created_at" timestamptz NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamptz NOT NULL,
	"updated_by" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamptz,
	"deleted_by" uuid,
	CONSTRAINT "ck_parts_deleted" CHECK ("parts"."is_deleted" = ("parts"."deleted_at" IS NOT NULL) AND "parts"."is_deleted" = ("parts"."deleted_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"processed_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "part_inventories" ADD CONSTRAINT "part_inventories_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_inventories" ADD CONSTRAINT "part_inventories_bin_id_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_photos" ADD CONSTRAINT "part_photos_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_bins_location" ON "bins" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bins_location_code" ON "bins" USING btree ("location_id","code") WHERE NOT "bins"."is_deleted";--> statement-breakpoint
CREATE INDEX "ix_customers_location" ON "customers" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "ix_part_inventories_location" ON "part_inventories" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_part_inventories_location_part" ON "part_inventories" USING btree ("location_id","part_id") WHERE NOT "part_inventories"."is_deleted";--> statement-breakpoint
CREATE INDEX "ix_part_photos_part" ON "part_photos" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_parts_part_number" ON "parts" USING btree ("part_number") WHERE NOT "parts"."is_deleted";