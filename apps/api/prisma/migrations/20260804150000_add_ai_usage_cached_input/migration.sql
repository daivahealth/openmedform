-- Of input_tokens, how many the provider served from its prompt cache (billed
-- at a deep discount). Lets /admin/usage show real vs effectively-billed input.
ALTER TABLE "ai_usage" ADD COLUMN "cached_input_tokens" INTEGER NOT NULL DEFAULT 0;
