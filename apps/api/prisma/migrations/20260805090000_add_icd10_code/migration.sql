-- Local ICD-10 slice for diagnosis-shaped fields (#136). Operator-loaded from
-- the public-domain CMS ICD-10-CM order file.
CREATE TABLE "icd10_code" (
  "code" VARCHAR(10) NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "short_name" VARCHAR(255),
  "billable" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "icd10_code_pkey" PRIMARY KEY ("code")
);
