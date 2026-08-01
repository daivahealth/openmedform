-- Drop form_ai_message: the conversation store for the Form.io drag-and-drop
-- builder's AI chat panel, which was removed with the engine (ADR-004).
--
-- Nothing writes to it any more — the panel, its hooks and the three
-- /forms/:id/ai/messages endpoints are all gone. The JSON Forms designer refines
-- through POST /forms/:id/jsonforms/refine and does not persist a transcript.
--
-- GUARD FIRST. These rows are user-authored content. If any exist the migration
-- RAISES and aborts the deploy rather than deleting them silently — export them
-- first, then re-run. (Local: 0 rows.)

DO $$
DECLARE
  message_rows bigint;
BEGIN
  SELECT count(*) INTO message_rows FROM form_ai_message;

  IF message_rows > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop form_ai_message: % row(s) of AI chat history still exist. Export them first if they are worth keeping.',
      message_rows;
  END IF;
END $$;

DROP TABLE "form_ai_message";
