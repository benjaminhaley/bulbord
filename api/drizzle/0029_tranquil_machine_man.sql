ALTER TABLE "user_connections" ADD COLUMN "notify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "friends_seen_at" timestamp with time zone;