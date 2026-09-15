-- AlterTable
ALTER TABLE "submission" ADD COLUMN     "effective_at" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "observation" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "patient_mrn" VARCHAR(50),
    "encounter_id" VARCHAR(100),
    "path" VARCHAR(500) NOT NULL,
    "code_system" VARCHAR(200),
    "code" VARCHAR(100),
    "label" VARCHAR(500) NOT NULL,
    "value_num" DOUBLE PRECISION,
    "value_text" TEXT,
    "value_bool" BOOLEAN,
    "unit" VARCHAR(50),
    "effective_at" TIMESTAMP(6) NOT NULL,
    "row" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observation_tenant_id_patient_mrn_code_effective_at_idx" ON "observation"("tenant_id", "patient_mrn", "code", "effective_at");

-- CreateIndex
CREATE INDEX "observation_tenant_id_patient_mrn_path_effective_at_idx" ON "observation"("tenant_id", "patient_mrn", "path", "effective_at");

-- CreateIndex
CREATE INDEX "observation_tenant_id_patient_mrn_form_id_effective_at_idx" ON "observation"("tenant_id", "patient_mrn", "form_id", "effective_at");

-- CreateIndex
CREATE INDEX "observation_submission_id_idx" ON "observation"("submission_id");

-- CreateIndex
CREATE INDEX "submission_tenant_id_patient_mrn_effective_at_idx" ON "submission"("tenant_id", "patient_mrn", "effective_at");

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

