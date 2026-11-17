ALTER TABLE "actions" ADD COLUMN "reversed_by_action_id" uuid;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "changed_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "actions_changed_seq_idx" ON "actions" USING btree ("changed_seq");--> statement-breakpoint
UPDATE "actions" SET "changed_seq" = "seq";