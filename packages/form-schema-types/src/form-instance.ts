/**
 * FormInstance — a captured response, kept separate from the definition.
 *
 * Clinical response data, workflow status, audit metadata, and form-definition
 * linkage are separate concerns. The response stays linked to the exact
 * published definition version and engine used to capture it.
 */

import type { AuditMetadata, FormEngine } from './common';

export type FormInstanceStatus =
  | 'DRAFT'
  | 'COMPLETED'
  | 'SIGNED'
  | 'CANCELLED';

export interface FormInstance {
  id: string;
  formDefinitionId: string;
  formCode: string;
  formVersion: string;
  /** Engine the response was captured under (pinned alongside the version). */
  engine: FormEngine;
  patientId?: string;
  episodeNumber?: string;
  status: FormInstanceStatus;
  /** Language-independent response values keyed by data-schema path. */
  response: Record<string, unknown>;
  audit: AuditMetadata;
  submittedBy?: string;
  submittedAt?: string;
}
