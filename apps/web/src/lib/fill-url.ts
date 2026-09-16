/**
 * The fill screen accepts the patient in the URL, so a "Fill again" action on
 * a record — or a bookmark per patient — opens a pre-filled round instead of
 * asking the clinician to retype an MRN (a typo there silently starts a new
 * patient with no history). Only the identifying context travels; the
 * clinician still confirms before the round starts.
 */

export interface FillPatientContext {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  department?: string;
  consultantName?: string;
}

/** Query-parameter names, kept short and stable — they end up in bookmarks. */
const PARAM: Record<keyof FillPatientContext, string> = {
  patientMrn: 'mrn',
  encounterId: 'encounter',
  patientName: 'name',
  age: 'age',
  gender: 'gender',
  department: 'department',
  consultantName: 'consultant',
};

/** `/fill/<slug>?mrn=…&encounter=…` for a patient; `/fill/<slug>` when nothing is known. */
export function fillUrlFor(slug: string, ctx: FillPatientContext | null | undefined): string {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAM) as Array<[keyof FillPatientContext, string]>) {
    const value = ctx?.[key]?.trim();
    if (value) params.set(param, value);
  }
  const qs = params.toString();
  return `/fill/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
}

/** The patient context carried by a fill-screen URL, or an empty object. */
export function patientContextFromParams(params: URLSearchParams | null | undefined): FillPatientContext {
  const ctx: FillPatientContext = {};
  if (!params) return ctx;
  for (const [key, param] of Object.entries(PARAM) as Array<[keyof FillPatientContext, string]>) {
    const value = params.get(param)?.trim();
    if (value) ctx[key] = value.slice(0, 200);
  }
  return ctx;
}

/** A saved submission's identifying context, for "Fill again for this patient". */
export function patientContextOfSubmission(sub: {
  patientMrn?: string | null;
  encounterId?: string | null;
  patientContext?: Record<string, unknown> | null;
}): FillPatientContext {
  const pc = (sub.patientContext ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    patientMrn: sub.patientMrn ?? str(pc.patientMrn),
    encounterId: sub.encounterId ?? str(pc.encounterId),
    patientName: str(pc.patientName),
    age: str(pc.age),
    gender: str(pc.gender),
    department: str(pc.department),
    consultantName: str(pc.consultantName),
  };
}
