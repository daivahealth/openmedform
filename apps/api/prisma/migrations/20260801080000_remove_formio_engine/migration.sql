-- Remove the Form.io engine (see docs/ADR/004-remove-formio-engine.md).
--
-- JSON Forms is now the only engine, so the engine discriminator and the single
-- coupled Form.io `schema` column go away.
--
-- GUARD FIRST. Dropping `schema` destroys the only copy of a Form.io form's
-- definition, and dropping the enum value strands any row still using it. Both
-- checks below RAISE and abort the whole migration (and therefore the deploy)
-- rather than silently discarding clinical form definitions. If either fires,
-- migrate or export those forms before re-running.

DO $$
DECLARE
  formio_versions bigint;
  legacy_schemas  bigint;
BEGIN
  SELECT count(*) INTO formio_versions
  FROM form_version
  WHERE engine = 'FORMIO';

  IF formio_versions > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop the Form.io engine: % form_version row(s) still have engine = FORMIO. Export or convert them first.',
      formio_versions;
  END IF;

  -- A JSONFORMS row should never carry a Form.io component tree, but check
  -- anyway: `schema` is about to be dropped and there is no second copy.
  SELECT count(*) INTO legacy_schemas
  FROM form_version
  WHERE schema IS NOT NULL;

  IF legacy_schemas > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop form_version.schema: % row(s) still hold a non-null value.',
      legacy_schemas;
  END IF;
END $$;

ALTER TABLE "form_version" DROP COLUMN "engine";
ALTER TABLE "form_version" DROP COLUMN "schema";
ALTER TABLE "conversion_job" DROP COLUMN "engine_target";

DROP TYPE "form_engine_enum";
