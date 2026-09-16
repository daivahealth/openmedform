-- Curated starter set of common clinical OBSERVATION codes, so a form's
-- vital-sign, anthropometric, neuro, pain, oxygenation, fluid, point-of-care
-- glucose, obstetric and newborn fields can be bound (and their history
-- aligned) without waiting for the full LOINC load. 65 rows.
--
-- Every code was verified ACTIVE against the LOINC release served by the
-- public FHIR terminology server (tx.fhir.org, LOINC 2.82) on 2026-09-16;
-- names are LOINC's own long common names and short names; related names
-- are LOINC's English synonyms plus the ward abbreviations searches use
-- (SpO2, GCS, AVPU, GRBS…). Same rows as prisma/loinc-starter.json, which
-- the dev seed loads. Idempotent: ON CONFLICT DO NOTHING never overwrites
-- operator-loaded data from scripts/import-loinc.ts. Still a SUBSET — load
-- the official table for real coverage. Verify against loinc.org before
-- relying on a code clinically.
--
-- This material contains content from LOINC (https://loinc.org), © Regenstrief
-- Institute, Inc. and the LOINC Committee, under https://loinc.org/license.
INSERT INTO "loinc_code" ("code", "component", "long_common_name", "short_name", "related_names") VALUES
  ('8867-4', 'Heart rate', 'Heart rate', 'Heart rate', 'HR pulse bpm Heart beat Pulse'),
  ('8889-8', 'Heart rate', 'Heart rate by Pulse oximetry', 'Heart rate PulseOx', 'Cardio Cardiology Heart beat Heart Disease Pulse PulseOx SpO2'),
  ('8893-0', 'Heart rate', 'Heart rate Peripheral artery by palpation', 'Heart rate Periph a Palpation', 'Art Cardio Cardiology Heart beat Heart Disease Periph Periph a Pulse'),
  ('8884-9', 'Heart rate rhythm', 'Heart rate rhythm', 'Heart rate rhythm', 'rhythm regular irregular Heart beat Pulse Typ'),
  ('9279-1', 'Breaths', 'Respiratory rate', 'Resp rate', 'RR breaths Breathing Lungs Respiratory rate RS'),
  ('8310-5', 'Body temperature', 'Body temperature', 'Body temperature', 'temp fever Bdy temp bod Bodies Temp Temperature'),
  ('8331-1', 'Body temperature', 'Oral temperature', 'Oral temp', 'Bdy temp bod Bodies Oral Temp Temperature'),
  ('8332-9', 'Body temperature', 'Rectal temperature', 'Rectal temp', 'Bdy temp bod Bodies Rectal Temp Temperature'),
  ('8333-7', 'Body temperature', 'Tympanic membrane temperature', 'Tymp memb temp', 'Bdy temp bod Bodies Ear Temp Temperature'),
  ('8328-7', 'Body temperature', 'Axillary temperature', 'Axil temp', 'Ax Bdy temp bod Bodies Temp Temperature'),
  ('75539-7', 'Body temperature', 'Body temperature - Temporal artery', 'Bdy temp Temporal a', 'Art Bdy temp bod Bodies forehead Temp Temperature'),
  ('8329-5', 'Body temperature', 'Body temperature - Core', 'Bdy temp Core', 'Bdy temp bod Bodies Temp Temperature'),
  ('8480-6', 'Intravascular systolic', 'Systolic blood pressure', 'BP sys', 'SBP Art sys Blood pressure Blood pressure systolic BP BP sys BP systolic Cardio Cardiology Heart Disease Intravenous IV Pressure SBP Sys BP'),
  ('8462-4', 'Intravascular diastolic', 'Diastolic blood pressure', 'BP dias', 'DBP Art sys Blood pressure Blood pressure diastolic BP BP dias BP diastolic Cardio Cardiology DBP Dias Dias BP Diast Diastoli Heart Disease Intravenous IV Pressure'),
  ('8478-0', 'Intravascular mean', 'Mean blood pressure', 'BP mean', 'MAP Art sys Average Avg Blood pressure mean BP BP mean Cardio Cardiology Heart Disease Intravenous IV MBP Pressure'),
  ('8479-8', 'Intravascular systolic', 'Systolic blood pressure by palpation', 'BP sys by Palpation', 'Art sys Blood pressure Blood pressure systolic BP BP sys BP systolic Cardio Cardiology Heart Disease Intravenous IV Pressure SBP Sys BP'),
  ('8459-0', 'Intravascular systolic^sitting', 'Systolic blood pressure--sitting', 'BP sys--sitting', 'Art sys Blood pressure Blood pressure systolic BP BP sys BP systolic Cardio Cardiology Heart Disease Intravenous IV Position Pressure SBP Sys BP'),
  ('8460-8', 'Intravascular systolic^standing', 'Systolic blood pressure--standing', 'BP sys--stand', 'Art sys Blood pressure Blood pressure systolic BP BP sys BP systolic Cardio Cardiology Heart Disease Intravenous IV Position Pressure SBP Stand) Sys BP WB Weight bearing'),
  ('8461-6', 'Intravascular systolic^supine', 'Systolic blood pressure--supine', 'BP sys--sup', 'Art sys Blood pressure Blood pressure systolic BP BP sys BP systolic Cardio Cardiology Heart Disease Intravenous IV Lying Position Pressure SBP Sys BP'),
  ('8453-3', 'Intravascular diastolic^sitting', 'Diastolic blood pressure--sitting', 'BP dias--sitting', 'Art sys Blood pressure Blood pressure diastolic BP BP dias BP diastolic Cardio Cardiology DBP Dias Dias BP Diast Diastoli Heart Disease Intravenous IV Position Pressure'),
  ('8454-1', 'Intravascular diastolic^standing', 'Diastolic blood pressure--standing', 'BP dias--stand', 'Art sys Blood pressure Blood pressure diastolic BP BP dias BP diastolic Cardio Cardiology DBP Dias Dias BP Diast Diastoli Heart Disease Intravenous IV Position Pressure Stand) WB Weight bearing'),
  ('8455-8', 'Intravascular diastolic^supine', 'Diastolic blood pressure--supine', 'BP dias--sup', 'Art sys Blood pressure Blood pressure diastolic BP BP dias BP diastolic Cardio Cardiology DBP Dias Dias BP Diast Diastoli Heart Disease Intravenous IV Lying Position Pressure'),
  ('59408-5', 'Oxygen saturation', 'Oxygen saturation in Arterial blood by Pulse oximetry', 'SaO2 % BldA PulseOx', 'SpO2 O2 sat sats pulse oximetry ABG ART Art bld Art blood Arterial Arterial blood Blood arterial Lung Mass Fraction O2 Percent Pulmonology PulseOx Respiratory SaO2 SAT Satn SO2 SpO2 tO2'),
  ('2708-6', 'Oxygen saturation', 'Oxygen saturation in Arterial blood', 'SaO2 % BldA', 'SaO2 ABG ART Art bld Art blood Arterial Arterial blood Blood arterial Chemistry Lung Mass Fraction O2 Percent Pulmonary Pulmonology Respiratory SaO2 SAT Satn SO2 tO2'),
  ('20564-1', 'Oxygen saturation', 'Oxygen saturation in Blood', 'SaO2 % Bld', 'Blood Hemodynamics Lung Mass fraction O2 Percent Pulmonary Pulmonology Respiratory SaO2 SAT Satn SO2 tO2 WB Whole blood'),
  ('3150-0', 'Oxygen/Gas.total', 'Inhaled oxygen concentration', 'Inhaled O2 concentration', 'FiO2 CLIN Gases IhG Inhaled Gas Inspired Lung O2 Percent Pulmonary Pulmonology Respiratory tO2 Tot Totl Volfr Volume fraction'),
  ('3151-8', 'Oxygen inhaled', 'Inhaled oxygen flow rate', 'Inhaled O2 flow rate', 'O2 flow oxygen litres CLIN Flow Gases IhG Inhaled Gas Inhaled O2 Inspired Lung O2 Pulmonary Pulmonology Respiratory tO2 Volume rate vRate'),
  ('19994-3', 'Oxygen/Gas.total setting', 'Oxygen/Total gas setting [Volume Fraction] Ventilator', 'O2/Total gas setting VFr Vent', 'Gases Lung O2 O2/gas .tot set Percent Pulmonology Respiratory tO2 Tot Total gas setting Totl Volfr Volume fraction'),
  ('19889-5', 'Carbon dioxide/Gas.total.at end expiration', 'Carbon dioxide/Gas.total.at end expiration in Exhaled gas', 'CO2 VFr ExG', 'ETCO2 end tidal capnography Breath Carbonic anhydride cO2 ExG Exhaled gas Exhaled gas (=breath) Exp Gases Lung Percent Pulmonology Respiratory Tot Totl Volfr Volume fraction'),
  ('19935-6', 'Expiratory gas flow.max', 'Maximum expiratory gas flow Respiratory system airway by Peak flow meter', 'PEF Airway PFM', 'PEFR peak flow Breathing Dynamic Flow Gases Largest Lung Lungs Maximal Maximum Peak Peak expiratory flow PEF PFM Pulmonary Pulmonology Respiratory RS Volume rate vRate'),
  ('44963-7', 'Capillary refill', 'Capillary refill [Time] of Nail bed', 'Capillary refill Time Nail Bed', 'CRT cap refill Capillary nail refill test CRT H+P Nail blanch test Nails P prime Ungal nail'),
  ('29463-7', 'Body weight', 'Body weight', 'Weight', 'weight wt kg AOEObservation Bdy weight bod Bodies Wt'),
  ('3141-9', 'Body weight', 'Body weight Measured', 'Weight Measured', 'Bdy weight bod Bodies Wt'),
  ('3142-7', 'Body weight', 'Body weight Stated', 'Weight Stated', 'Bdy weight bod Bodies Wt'),
  ('8335-2', 'Body weight', 'Body weight Estimated', 'Weight Est', 'Bdy weight bod Bodies Est estimation Wt'),
  ('8339-4', 'Body weight^at birth', 'Birth weight Measured', 'Birth weight Measured', '@ birth Bdy weight bod Bodies New born Newborn Wt'),
  ('8302-2', 'Body height', 'Body height', 'Body height', 'height ht cm AOEObservation Axial length bod Bodies Body length Length'),
  ('3137-7', 'Body height', 'Body height Measured', 'Body height Measured', 'Axial length bod Bodies Body length Length'),
  ('8306-3', 'Body height^lying', 'Body height --lying', 'Body height lying', 'Axial length bod Bodies Body length Length Recumbant'),
  ('8308-9', 'Body height^standing', 'Body height --standing', 'Body height stand', 'Axial length bod Bodies Body length Length Stand) WB Weight bearing'),
  ('39156-5', 'Body mass index', 'Body mass index (BMI) [Ratio]', 'BMI', 'BMI BMI bod Bodies Quetelet index Ratios Rto'),
  ('8287-5', 'Circumference.occipital-frontal', 'Head Occipital-frontal circumference by Tape measure', 'Head Circumf OFC by Tape measure', 'head circumference OFC Brain Circumf OFC Cranial Cranium Girth Intracranial Length Skull'),
  ('9843-4', 'Circumference.occipital-frontal', 'Head Occipital-frontal circumference', 'Head Circumf OFC', 'head circumference Brain Circumf OFC Cranial Cranium Girth Intracranial Length Skull'),
  ('8280-0', 'Circumference.at umbilicus', 'Waist Circumference at umbilicus by Tape measure', 'Circumf.at umbilicus by Tape measure', 'Abd Abdo Abdomen+ Abdominal Circumf.at umbilicus Girth Length Maximum mid-abdomen girth'),
  ('72514-3', 'Pain severity - 0-10 verbal numeric rating', 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', 'Pain severity 0-10 Scre Reported', 'pain score NRS 0-10 H+P P prime Pain severity 0-10 Scale Scre'),
  ('38208-5', 'Pain severity', 'Pain severity - Reported', 'Pain severity Reported', 'Finding Findings H+P P prime Qual Screen'),
  ('38221-8', 'Pain severity', 'Pain severity Wong-Baker FACES pain rating scale', 'Pain severity Wong-Baker FACES Scale', 'faces pain scale Finding Findings H+P P prime Qual Screen Wong-Baker FACES Scale'),
  ('9269-2', 'Glasgow coma score.total', 'Glasgow coma score total', 'GCS total', 'GCS FCN Func Funct Function GCS total Neuro Neurology Tot Totl'),
  ('9267-6', 'Glasgow coma score.eye opening', 'Glasgow coma score eye opening', 'GCS eye', 'FCN Func Funct Function GCS eye GCS.eye nemsis Neuro Neurology Qual Screen'),
  ('9268-4', 'Glasgow coma score.motor', 'Glasgow coma score motor', 'GCS motor', 'FCN Func Funct Function GCS motor Neuro Neurology Qual Screen'),
  ('9270-0', 'Glasgow coma score.verbal', 'Glasgow coma score verbal', 'GCS verbal', 'FCN Func Funct Function GCS verbal Neuro Neurology Qual Screen'),
  ('67775-7', 'Level of responsiveness', 'Level of responsiveness', 'Level of responsiveness', 'AVPU alert voice pain unresponsive consciousness Finding Findings Levels Levl LV LVL Qual Screen'),
  ('80319-7', 'Breath sounds', 'Breath sounds by Auscultation', 'Breath sounds Auscultation', 'Ausc Breathing Finding Findings H+P Lungs P prime RS'),
  ('9187-6', 'Fluid output.urine', 'Urine output', 'Fluid output urine', 'urine output UO Fld Fluid output urine Volume'),
  ('9192-6', 'Fluid output.urine', 'Urine output 24 hour', 'Fluid output urine 24h', '1 day 24 hours 24HR Fld Flow Fluid output urine Volume Rate vRate'),
  ('2339-0', 'Glucose', 'Glucose [Mass/volume] in Blood', 'Glucose Bld-mCnc', 'blood sugar RBS Blood Chemistry Endocrine Endocrinology Glu Gluc Glucoseur Level Mass concentration UniversalLabOrders WB Whole blood'),
  ('41653-7', 'Glucose', 'Glucose [Mass/volume] in Capillary blood by Glucometer', 'Glucose BldC Glucomtr-mCnc', 'blood sugar GRBS RBS CBG glucometer Blood - capillary Cap bld Cap blood Capillary bld Capillary blood Chemistry Endocrine Endocrinology Finger stick Glu Gluc Glucomtr Glucoseur Level Mass concentration UniversalLabOrders'),
  ('14743-9', 'Glucose', 'Glucose [Moles/volume] in Capillary blood by Glucometer', 'Glucose BldC Glucomtr-sCnc', 'blood sugar CBG mmol Blood - capillary Cap bld Cap blood Capillary bld Capillary blood Chemistry Endocrine Endocrinology Finger stick Glu Gluc Glucomtr Glucoseur Level Substance concentration'),
  ('15074-8', 'Glucose', 'Glucose [Moles/volume] in Blood', 'Glucose Bld-sCnc', 'Blood Chemistry Endocrine Endocrinology Glu Gluc Glucoseur Level Substance concentration WB Whole blood'),
  ('55283-6', 'Heart rate', 'Fetal Heart rate', 'Fet Heart rate', 'FHR Fetal Gyn Gynecology H+P Heart beat OB ObGyn Obstetrics P prime Pulse'),
  ('9272-6', 'Score^1M post birth', '1 minute Apgar Score', '1M Apgar Score', 'After Function Gyn Gynecology OB ObGyn Obstetrics p birth PST'),
  ('9274-2', 'Score^5M post birth', '5 minute Apgar Score', '5M Apgar Score', 'After Function Gyn Gynecology OB ObGyn Obstetrics p birth PST'),
  ('9271-8', 'Score^10M post birth', '10 minute Apgar Score', '10M Apgar Score', 'After Function Gyn Gynecology OB ObGyn Obstetrics p birth PST'),
  ('59461-4', 'Fall risk level', 'Fall risk level [Morse Fall Scale]', 'Fall risk level [Morse Fall Scale]', 'Morse falls Finding Findings Levels Levl LV LVL MFS Morse Fall Score Qual Screen Survey VTE'),
  ('882-1', 'ABO+Rh group', 'ABO and Rh group [Type] in Blood', 'ABO+Rh Bld', 'blood group blood type ABO Rh')
ON CONFLICT ("code") DO NOTHING;
