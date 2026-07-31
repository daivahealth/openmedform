-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "form_id" UUID;

-- CreateIndex
CREATE INDEX "ai_usage_form_id_idx" ON "ai_usage"("form_id");
