export interface FormioComponent {
  type: string;
  key: string;
  label?: string;
  input?: boolean;
  components?: FormioComponent[];
  columns?: Array<{ components: FormioComponent[] }>;
  [key: string]: unknown;
}

export interface FormioSchema {
  display: 'form' | 'wizard' | 'pdf';
  components: FormioComponent[];
  [key: string]: unknown;
}

export enum FormStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum SubmissionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  AMENDED = 'AMENDED',
  VOIDED = 'VOIDED',
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  FORM_DESIGNER = 'FORM_DESIGNER',
  CLINICIAN = 'CLINICIAN',
  VIEWER = 'VIEWER',
}
