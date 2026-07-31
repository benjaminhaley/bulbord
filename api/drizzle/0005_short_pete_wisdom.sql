ALTER TABLE "feedback" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "completion_note" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "completed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;