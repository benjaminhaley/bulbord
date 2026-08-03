CREATE TABLE "feedback_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feedback_images" ADD CONSTRAINT "feedback_images_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "feedback_images" ("feedback_id", "image_url", "thumbnail_url", "position", "created_at", "updated_at")
SELECT "id", "image_url", "thumbnail_url", 0, "created_at", "updated_at"
FROM "feedback"
WHERE "image_url" IS NOT NULL AND "thumbnail_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "thumbnail_url";