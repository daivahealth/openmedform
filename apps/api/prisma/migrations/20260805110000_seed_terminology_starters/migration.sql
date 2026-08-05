-- Starter terminology codes as a data migration, so environments whose
-- migrations run on boot (production Cloud Run) get working code search and
-- AI suggestions without running the dev seed (which creates demo
-- credentials and must never run in production). Same rows as prisma/seed.ts.
-- Idempotent: ON CONFLICT DO NOTHING never overwrites operator-loaded data
-- from scripts/import-loinc.ts / scripts/import-icd10.ts.
--
-- LOINC starter subset. Verify any code against loinc.org before relying on
-- it clinically. This material contains content from LOINC
-- (https://loinc.org), © Regenstrief Institute, Inc. and the LOINC
-- Committee, under https://loinc.org/license.
INSERT INTO "loinc_code" ("code", "component", "long_common_name", "short_name", "related_names") VALUES
  ('8867-4', 'Heart rate', 'Heart rate', 'Heart rate', 'HR pulse rate beats per minute bpm'),
  ('9279-1', 'Respiratory rate', 'Respiratory rate', 'Resp rate', 'RR breaths respiration breathing rate'),
  ('8310-5', 'Body temperature', 'Body temperature', 'Body temperature', 'temp fever celsius fahrenheit'),
  ('8480-6', 'Systolic blood pressure', 'Systolic blood pressure', 'BP sys', 'SBP systolic BP blood pressure'),
  ('8462-4', 'Diastolic blood pressure', 'Diastolic blood pressure', 'BP dias', 'DBP diastolic BP blood pressure'),
  ('59408-5', 'Oxygen saturation', 'Oxygen saturation in Arterial blood by Pulse oximetry', 'SaO2 % BldA PulseOx', 'SpO2 O2 sat oxygen saturation pulse oximetry'),
  ('29463-7', 'Body weight', 'Body weight', 'Weight', 'weight wt kg'),
  ('8302-2', 'Body height', 'Body height', 'Body height', 'height ht cm stature'),
  ('72514-3', 'Pain severity', 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', 'Pain severity 0-10 Score', 'pain score NRS numeric rating scale 0-10'),
  ('882-1', 'ABO+Rh group', 'ABO and Rh group [Type] in Blood', 'ABO+Rh Bld', 'blood group blood type ABO Rh')
ON CONFLICT ("code") DO NOTHING;

-- ICD-10 starter subset (ubiquitous category codes; CMS order file is the
-- real source — public domain). Verify before clinical reliance.
INSERT INTO "icd10_code" ("code", "title", "short_name") VALUES
  ('E11', 'Type 2 diabetes mellitus', 'Type 2 diabetes'),
  ('I10', 'Essential (primary) hypertension', 'Hypertension'),
  ('J45', 'Asthma', 'Asthma'),
  ('N18', 'Chronic kidney disease (CKD)', 'CKD'),
  ('I25', 'Chronic ischemic heart disease', 'Ischemic heart disease'),
  ('J44', 'Other chronic obstructive pulmonary disease', 'COPD')
ON CONFLICT ("code") DO NOTHING;
