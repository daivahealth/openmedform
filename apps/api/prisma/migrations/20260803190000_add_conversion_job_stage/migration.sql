-- Live progress for the conversion dialog: which pipeline stage a RUNNING job
-- is in, plus a short human detail line. Informational only — control flow
-- keeps reading status.
ALTER TABLE "conversion_job" ADD COLUMN "stage" VARCHAR(40);
ALTER TABLE "conversion_job" ADD COLUMN "stage_detail" VARCHAR(255);
