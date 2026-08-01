CREATE TABLE "passkey_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "auth_identities" CASCADE;--> statement-breakpoint
DROP TABLE "login_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credentials_credential_id_idx" ON "passkey_credentials" USING btree ("credential_id");