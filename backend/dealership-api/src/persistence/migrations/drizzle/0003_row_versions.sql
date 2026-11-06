ALTER TABLE "customers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;