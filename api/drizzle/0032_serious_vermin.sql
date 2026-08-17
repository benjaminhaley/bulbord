CREATE TABLE "feedback_comment_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_comment_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feedback_comment_images" ADD CONSTRAINT "feedback_comment_images_feedback_comment_id_feedback_comments_id_fk" FOREIGN KEY ("feedback_comment_id") REFERENCES "public"."feedback_comments"("id") ON DELETE no action ON UPDATE no action;