-- CreateEnum
CREATE TYPE "form_type_enum" AS ENUM ('PATIENT', 'NON_PATIENT');

-- AlterTable
ALTER TABLE "form" ADD COLUMN     "form_type" "form_type_enum" NOT NULL DEFAULT 'PATIENT';

-- AlterTable
ALTER TABLE "submission" ADD COLUMN     "patient_context" JSONB;
