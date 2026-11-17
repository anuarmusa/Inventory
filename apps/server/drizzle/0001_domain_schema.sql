CREATE TYPE "public"."action_outcome" AS ENUM('applied', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."barcode_source" AS ENUM('household', 'open_food_facts');--> statement-breakpoint
CREATE TYPE "public"."mismatch_kind" AS ENUM('shortfall', 'skipped_action', 'double_assignment');--> statement-breakpoint
CREATE TYPE "public"."mismatch_resolution" AS ENUM('accepted', 'counted', 'redone', 'kept', 'merged', 'undone');--> statement-breakpoint
CREATE TABLE "actions" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"shape_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"corrected_time" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "action_outcome" NOT NULL,
	"result" jsonb,
	CONSTRAINT "actions_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"location_id" uuid,
	"purchase_date" date,
	"price_sen" integer,
	"shop" text,
	"serial_number" text,
	"warranty_end" date,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"receipt_photo_id" uuid,
	"notes" text,
	"disposed_at" date,
	"disposed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_price_nonnegative" CHECK ("assets"."price_sen" IS NULL OR "assets"."price_sen" >= 0)
);
--> statement-breakpoint
CREATE TABLE "barcodes" (
	"code" text PRIMARY KEY NOT NULL,
	"supply_id" uuid NOT NULL,
	"brand" text,
	"product_name" text,
	"pack_size" text,
	"photo_id" uuid,
	"units_per_scan" integer DEFAULT 1 NOT NULL,
	"source" "barcode_source" DEFAULT 'household' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barcodes_units_per_scan_positive" CHECK ("barcodes"."units_per_scan" > 0)
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"supply_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"expiry" date,
	"location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_quantity_nonnegative" CHECK ("batches"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model" text,
	"key_hash" text NOT NULL,
	"app_version" text,
	"clock_offset_ms" integer DEFAULT 0 NOT NULL,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "household_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"near_expiry_days" integer DEFAULT 7 NOT NULL,
	CONSTRAINT "household_settings_single_row" CHECK ("household_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"code" text PRIMARY KEY NOT NULL,
	"asset_id" uuid,
	"location_id" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_one_target" CHECK ("labels"."asset_id" IS NULL OR "labels"."location_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"date" date NOT NULL,
	"note" text NOT NULL,
	"cost_sen" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mismatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "mismatch_kind" NOT NULL,
	"action_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_action_id" uuid,
	"resolution" "mismatch_resolution"
);
--> statement-breakpoint
CREATE TABLE "supplies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category_id" uuid,
	"usual_location_id" uuid,
	"minimum" integer,
	"restock_to" integer,
	"expires" boolean DEFAULT true NOT NULL,
	"near_expiry_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "supplies_minimum_nonnegative" CHECK ("supplies"."minimum" IS NULL OR "supplies"."minimum" >= 0),
	CONSTRAINT "supplies_restock_to_positive" CHECK ("supplies"."restock_to" IS NULL OR "supplies"."restock_to" > 0)
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_entries" ADD CONSTRAINT "maintenance_entries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mismatches" ADD CONSTRAINT "mismatches_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mismatches" ADD CONSTRAINT "mismatches_resolved_by_action_id_actions_id_fk" FOREIGN KEY ("resolved_by_action_id") REFERENCES "public"."actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplies" ADD CONSTRAINT "supplies_usual_location_id_locations_id_fk" FOREIGN KEY ("usual_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_device_idx" ON "actions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "actions_type_idx" ON "actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "barcodes_supply_idx" ON "barcodes" USING btree ("supply_id");--> statement-breakpoint
CREATE INDEX "batches_supply_idx" ON "batches" USING btree ("supply_id");--> statement-breakpoint
CREATE INDEX "maintenance_entries_asset_idx" ON "maintenance_entries" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "mismatches_open_idx" ON "mismatches" USING btree ("resolved_at");--> statement-breakpoint
-- The single household-settings row, with the 7-day Near-expiry default.
INSERT INTO "household_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
