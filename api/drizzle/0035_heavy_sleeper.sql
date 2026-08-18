CREATE TABLE "sports_club_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sports_club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sports_club_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sports_club_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sports_club_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sports_club_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sports_club_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sports_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"schedule_type" text DEFAULT 'fixed_session' NOT NULL,
	"first_date" date,
	"last_date" date,
	"cadence_note" text,
	"age_min" integer,
	"age_max" integer,
	"price" numeric(6, 2),
	"price_unit" text,
	"price_note" text,
	"address" text,
	"location_name" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"distance_miles" numeric(5, 2),
	"signup_status" text,
	"signup_instructions" text,
	"source_url" text,
	"source_id" uuid,
	"image_url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sports_club_comments" ADD CONSTRAINT "sports_club_comments_sports_club_id_sports_clubs_id_fk" FOREIGN KEY ("sports_club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_club_comments" ADD CONSTRAINT "sports_club_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_club_interests" ADD CONSTRAINT "sports_club_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_club_interests" ADD CONSTRAINT "sports_club_interests_sports_club_id_sports_clubs_id_fk" FOREIGN KEY ("sports_club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD CONSTRAINT "sports_club_occurrences_sports_club_id_sports_clubs_id_fk" FOREIGN KEY ("sports_club_id") REFERENCES "public"."sports_clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_clubs" ADD CONSTRAINT "sports_clubs_source_id_sports_club_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sports_club_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sports_club_interests_user_sports_club_idx" ON "sports_club_interests" USING btree ("user_id","sports_club_id");