CREATE SEQUENCE IF NOT EXISTS "feedback_number_seq";
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "number" integer;
--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC) AS rn FROM "feedback"
)
UPDATE "feedback" SET "number" = numbered.rn
FROM numbered
WHERE "feedback"."id" = numbered.id;
--> statement-breakpoint
SELECT setval('feedback_number_seq', COALESCE((SELECT MAX("number") FROM "feedback"), 0));
--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "number" SET DEFAULT nextval('feedback_number_seq');
--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "number" SET NOT NULL;
--> statement-breakpoint
ALTER SEQUENCE "feedback_number_seq" OWNED BY "feedback"."number";
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_number_unique" UNIQUE("number");
