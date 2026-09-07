CREATE TABLE "entity_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_edits" ADD CONSTRAINT "entity_edits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_edits_entity_idx" ON "entity_edits" USING btree ("entity_type","entity_id","created_at");