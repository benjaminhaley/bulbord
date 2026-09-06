CREATE TABLE "rejected_event_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"candidate_data" jsonb NOT NULL,
	"rejection_type" text NOT NULL,
	"rejection_reason" text NOT NULL,
	"duplicate_of_event_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"review_action" text,
	"review_note" text,
	"added_as_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pipeline_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pipeline_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pipeline_review_note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pipeline_relevance_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pipeline_quality_checks" jsonb;--> statement-breakpoint
ALTER TABLE "rejected_event_candidates" ADD CONSTRAINT "rejected_event_candidates_event_source_id_event_sources_id_fk" FOREIGN KEY ("event_source_id") REFERENCES "public"."event_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_event_candidates" ADD CONSTRAINT "rejected_event_candidates_duplicate_of_event_id_events_id_fk" FOREIGN KEY ("duplicate_of_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_event_candidates" ADD CONSTRAINT "rejected_event_candidates_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_event_candidates" ADD CONSTRAINT "rejected_event_candidates_added_as_event_id_events_id_fk" FOREIGN KEY ("added_as_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_pipeline_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("pipeline_reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;