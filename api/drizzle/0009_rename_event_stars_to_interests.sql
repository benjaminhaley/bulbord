ALTER TABLE "event_stars" RENAME TO "event_interests";--> statement-breakpoint
ALTER TABLE "event_interests" RENAME CONSTRAINT "event_stars_pkey" TO "event_interests_pkey";--> statement-breakpoint
ALTER TABLE "event_interests" RENAME CONSTRAINT "event_stars_user_id_users_id_fk" TO "event_interests_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "event_interests" RENAME CONSTRAINT "event_stars_event_id_events_id_fk" TO "event_interests_event_id_events_id_fk";--> statement-breakpoint
ALTER INDEX "event_stars_user_event_idx" RENAME TO "event_interests_user_event_idx";--> statement-breakpoint
ALTER TABLE "event_interests" ADD COLUMN "status" text;--> statement-breakpoint
UPDATE "event_interests" SET "status" = 'interested' WHERE "status" IS NULL;--> statement-breakpoint
ALTER TABLE "event_interests" ALTER COLUMN "status" SET NOT NULL;
