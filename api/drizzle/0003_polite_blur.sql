CREATE UNIQUE INDEX "auth_identities_provider_account_idx" ON "auth_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_codes_code_hash_idx" ON "login_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");