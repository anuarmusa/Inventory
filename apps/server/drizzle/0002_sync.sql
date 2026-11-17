ALTER TABLE "batches" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "barcodes" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "household_settings" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_entries" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mismatches" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplies" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_key_hash_unique" UNIQUE("key_hash");