ALTER TABLE "camps" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "camps" ADD COLUMN "options_note" text;--> statement-breakpoint
ALTER TABLE "camps" ADD COLUMN "prep_items" jsonb;--> statement-breakpoint
ALTER TABLE "camps" ADD COLUMN "prep_note" text;--> statement-breakpoint
ALTER TABLE "camps" DROP COLUMN "price_details";--> statement-breakpoint
ALTER TABLE "camps" DROP COLUMN "prep_instructions";