/**
 * Curated clinical form categories offered when creating a form. Shared by the
 * prompt and file create dialogs so the option list stays consistent. "Other"
 * is handled separately (see CategorySelect) to let users type a custom value.
 */
export const FORM_CATEGORIES = [
  'Intake / Registration',
  'Assessment',
  'Screening',
  'Risk Assessment',
  'Triage',
  'Vital Signs / Observations',
  'Consent',
  'Medication / Prescription',
  'Care Plan',
  'Progress Note',
  'Procedure / Operative',
  'Pre-Operative',
  'Post-Operative',
  'Discharge',
  'Referral',
  'Handover (SBAR)',
  'Nursing',
  'Diagnostic / Lab',
  'Follow-up',
  'Checklist',
  'Audit / Quality',
  'Feedback / Survey',
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number];

export const OTHER_CATEGORY = 'Other';

export function isKnownCategory(value: string): boolean {
  return (FORM_CATEGORIES as readonly string[]).includes(value);
}
