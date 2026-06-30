-- CreateTable
CREATE TABLE "ai_provider_config" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "api_key" TEXT NOT NULL,
    "model" VARCHAR(100),
    "base_url" VARCHAR(500),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_config_tenant_id_idx" ON "ai_provider_config"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_config_tenant_id_provider_key" ON "ai_provider_config"("tenant_id", "provider");
