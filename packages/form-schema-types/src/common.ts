/**
 * Shared primitives used across the form contracts.
 */

/** Lifecycle state of a form definition version. */
export type FormStatus =
  | 'DRAFT'
  | 'CONVERTING'
  | 'REVIEW'
  | 'PUBLISHED'
  | 'RETIRED';

/** Created/updated bookkeeping carried on definitions and instances. */
export interface AuditMetadata {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** ISO-639-1 style language code, e.g. 'en', 'el'. */
export type LanguageCode = string;
