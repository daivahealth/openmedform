-- Archived forms are hidden from the default list, so record WHEN they were
-- archived (the clock a retention policy runs off) and WHAT status to restore.
--
-- status_before_archive is stored rather than derived: a form archived while
-- awaiting review should come back to REVIEW, and that cannot be worked out
-- after the fact from the versions alone.
ALTER TABLE "form" ADD COLUMN "archived_at" TIMESTAMP(6);
ALTER TABLE "form" ADD COLUMN "status_before_archive" "form_status_enum";

-- Forms archived before this migration have no recorded timestamp. Backfill
-- from updated_at, which for an archived form is when it was archived in all
-- but pathological cases — better than leaving a null the retention job would
-- have to guess about.
UPDATE "form" SET "archived_at" = "updated_at" WHERE "status" = 'ARCHIVED';

CREATE INDEX "form_archived_at_idx" ON "form"("archived_at");
