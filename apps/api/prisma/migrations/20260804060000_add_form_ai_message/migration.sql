-- The refine conversation for a form: one row per chat bubble in the designer
-- panel (user instruction / assistant outcome, including failures). Scoped to
-- the form so history survives the draft fork a published-form refine makes.
--
-- Same name as the table dropped in 20260801190000: that one belonged to the
-- removed Form.io builder and was guarded against data loss before dropping.
-- This is its JSON Forms successor, not a revert.
CREATE TABLE "form_ai_message" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "form_id" UUID NOT NULL,
  "role" VARCHAR(12) NOT NULL,
  "content" TEXT NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'OK',
  "had_image" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "form_ai_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_ai_message_tenant_id_form_id_created_at_idx"
  ON "form_ai_message"("tenant_id", "form_id", "created_at");
