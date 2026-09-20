-- Events and sports-club occurrences move from timezone-less date+time
-- columns to real UTC instants (timestamptz). Existing values were all
-- Chicago wall-clock, so they're converted from America/Chicago. The old
-- date/time columns come back as read-only GENERATED columns derived from the
-- instants (Chicago wall-clock views), so date grouping, dedup and the newsletter
-- keep working without a second source of truth. A row with no time
-- becomes a date-only (all_day) entry stored at Chicago midnight.
ALTER TABLE "events" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
UPDATE "events" SET
  "all_day" = ("all_day" OR "start_time" IS NULL),
  "starts_at" = (CASE WHEN "all_day" OR "start_time" IS NULL THEN "start_date"::timestamp ELSE "start_date" + "start_time" END) AT TIME ZONE 'America/Chicago',
  "ends_at" = CASE WHEN NOT ("all_day" OR "start_time" IS NULL) AND "end_time" IS NOT NULL THEN ("start_date" + "end_time") AT TIME ZONE 'America/Chicago' END;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "start_date";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "start_time";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "end_time";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "start_date" date GENERATED ALWAYS AS (((starts_at AT TIME ZONE 'America/Chicago')::date)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "start_time" time GENERATED ALWAYS AS ((CASE WHEN all_day THEN NULL ELSE (starts_at AT TIME ZONE 'America/Chicago')::time END)) STORED;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_time" time GENERATED ALWAYS AS ((CASE WHEN all_day OR ends_at IS NULL THEN NULL ELSE (ends_at AT TIME ZONE 'America/Chicago')::time END)) STORED;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "sports_club_occurrences" SET
  "all_day" = ("start_time" IS NULL),
  "starts_at" = (CASE WHEN "start_time" IS NULL THEN "date"::timestamp ELSE "date" + "start_time" END) AT TIME ZONE 'America/Chicago',
  "ends_at" = CASE WHEN "start_time" IS NOT NULL AND "end_time" IS NOT NULL THEN ("date" + "end_time") AT TIME ZONE 'America/Chicago' END;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" DROP COLUMN "date";--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" DROP COLUMN "start_time";--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" DROP COLUMN "end_time";--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "date" date GENERATED ALWAYS AS (((starts_at AT TIME ZONE 'America/Chicago')::date)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "start_time" time GENERATED ALWAYS AS ((CASE WHEN all_day THEN NULL ELSE (starts_at AT TIME ZONE 'America/Chicago')::time END)) STORED;--> statement-breakpoint
ALTER TABLE "sports_club_occurrences" ADD COLUMN "end_time" time GENERATED ALWAYS AS ((CASE WHEN all_day OR ends_at IS NULL THEN NULL ELSE (ends_at AT TIME ZONE 'America/Chicago')::time END)) STORED;--> statement-breakpoint
-- Camp daily hours stay venue-local wall-clock (a multi-day camp repeats them
-- every day, so they aren't one instant) but now carry their zone explicitly.
ALTER TABLE "camps" ADD COLUMN "time_zone" text DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
COMMENT ON COLUMN "events"."starts_at" IS 'Source of truth: UTC instant. start_date/start_time/end_time are derived Chicago wall-clock views — never write them.';--> statement-breakpoint
COMMENT ON COLUMN "sports_club_occurrences"."starts_at" IS 'Source of truth: UTC instant. date/start_time/end_time are derived Chicago wall-clock views — never write them.';
