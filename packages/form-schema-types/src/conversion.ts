/**
 * Conversion metadata — per-field confidence and review warnings produced by
 * the AI PDF conversion pipeline. Uncertain elements must never be dropped
 * silently; they are surfaced here for the review application.
 */

export type ConversionWarningType =
  | 'UNCLEAR_LABEL'
  | 'AMBIGUOUS_FIELD_TYPE'
  | 'POSSIBLE_OCR_ERROR'
  | 'UNCERTAIN_CHECKBOX_GROUPING'
  | 'UNCERTAIN_REQUIRED_STATUS'
  | 'UNCERTAIN_FIELD_BINDING'
  | 'UNCERTAIN_SECTION_BOUNDARY'
  | 'UNCERTAIN_TRANSLATION'
  | 'POTENTIAL_MISSING_FIELD';

export interface ConversionWarning {
  type: ConversionWarningType;
  message: string;
  /** Data-schema path / UI scope the warning relates to, when field-specific. */
  binding?: string;
  sourcePage?: number;
}

export interface FieldConversionMeta {
  /** Data-schema path / UI scope for the field. */
  binding: string;
  sourcePage: number;
  /** Detection confidence, 0..1. */
  confidence: number;
  warnings: ConversionWarning[];
}

export interface ConversionMetadata {
  sourceFileName?: string;
  pageCount: number;
  formTitle?: string;
  formCode?: string;
  formVersionDetected?: string;
  generatedAt: string;
  provider?: string;
  model?: string;
  /** Per-field detection metadata. */
  fields: FieldConversionMeta[];
  /** Form-level warnings not tied to a single field. */
  warnings: ConversionWarning[];
  /** Similarity to the source PDF from the visual-diff loop, 0..1, when run. */
  similarityScore?: number;
}
