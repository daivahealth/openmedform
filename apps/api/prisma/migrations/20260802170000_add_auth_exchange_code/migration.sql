-- One-time codes that trade for an access token after Google SSO, so the JWT
-- itself never travels in a redirect URL (and therefore never lands in browser
-- history, Referer headers or access logs).
--
-- A table rather than in-process state because the redirect and the exchange
-- are two separate requests that can be served by different instances.
CREATE TABLE "auth_exchange_code" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- SHA-256 hex of the code. The plaintext only ever exists in the redirect
    -- URL, so a leak of this table yields nothing usable.
    "code_hash" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    -- Set on first use. Used rows are kept briefly so a replay can be
    -- distinguished from an expired code.
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_exchange_code_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_exchange_code_code_hash_key" ON "auth_exchange_code"("code_hash");
CREATE INDEX "auth_exchange_code_expires_at_idx" ON "auth_exchange_code"("expires_at");
