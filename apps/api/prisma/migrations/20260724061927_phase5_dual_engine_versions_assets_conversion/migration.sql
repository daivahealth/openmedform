-- CreateEnum
CREATE TYPE "form_engine_enum" AS ENUM ('FORMIO', 'JSONFORMS');

-- CreateEnum
CREATE TYPE "conversion_job_status_enum" AS ENUM ('PENDING', 'RUNNING', 'REVIEW', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "form_status_enum" ADD VALUE 'CONVERTING';
ALTER TYPE "form_status_enum" ADD VALUE 'REVIEW';
ALTER TYPE "form_status_enum" ADD VALUE 'RETIRED';

-- AlterEnum
ALTER TYPE "submission_status_enum" ADD VALUE 'SIGNED';

-- AlterTable
ALTER TABLE "form_version" ADD COLUMN     "content_hash" VARCHAR(64),
ADD COLUMN     "conversion_metadata" JSONB,
ADD COLUMN     "data_schema" JSONB,
ADD COLUMN     "engine" "form_engine_enum" NOT NULL DEFAULT 'FORMIO',
ADD COLUMN     "print_schema" JSONB,
ADD COLUMN     "translations" JSONB,
ADD COLUMN     "ui_schema" JSONB,
ALTER COLUMN "schema" DROP NOT NULL;

-- CreateTable
CREATE TABLE "form_asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_version_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(64),
    "storage_key" VARCHAR(500),
    "data" BYTEA,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_job" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_id" UUID,
    "status" "conversion_job_status_enum" NOT NULL DEFAULT 'PENDING',
    "engine_target" "form_engine_enum" NOT NULL DEFAULT 'JSONFORMS',
    "provider" VARCHAR(50),
    "model" VARCHAR(100),
    "source_file_name" VARCHAR(255),
    "page_count" INTEGER,
    "similarity_score" DOUBLE PRECISION,
    "error" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "conversion_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_warning" (
    "id" UUID NOT NULL,
    "conversion_job_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "binding" VARCHAR(500),
    "source_page" INTEGER,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_warning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_asset_tenant_id_idx" ON "form_asset"("tenant_id");

-- CreateIndex
CREATE INDEX "form_asset_form_version_id_idx" ON "form_asset"("form_version_id");

-- CreateIndex
CREATE INDEX "conversion_job_tenant_id_status_idx" ON "conversion_job"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "conversion_warning_conversion_job_id_idx" ON "conversion_warning"("conversion_job_id");

-- AddForeignKey
ALTER TABLE "conversion_warning" ADD CONSTRAINT "conversion_warning_conversion_job_id_fkey" FOREIGN KEY ("conversion_job_id") REFERENCES "conversion_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
