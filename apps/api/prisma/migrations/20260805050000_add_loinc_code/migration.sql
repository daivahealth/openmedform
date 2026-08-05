-- Local LOINC slice for terminology suggestions + dictionary search (#135).
-- Reference data, operator-loaded from the official LOINC release.
CREATE TABLE "loinc_code" (
  "code" VARCHAR(20) NOT NULL,
  "component" VARCHAR(255) NOT NULL,
  "long_common_name" VARCHAR(500) NOT NULL,
  "short_name" VARCHAR(255),
  "related_names" TEXT,
  "class" VARCHAR(100),

  CONSTRAINT "loinc_code_pkey" PRIMARY KEY ("code")
);
