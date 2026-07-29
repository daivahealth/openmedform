-- CreateTable
CREATE TABLE "ai_usage" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_tenant_id_idx" ON "ai_usage"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_idx" ON "ai_usage"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");
