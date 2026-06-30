'use client';

import { UserRound } from 'lucide-react';

interface PatientContext {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  department?: string;
  consultantName?: string;
}

interface PatientHeaderBarProps {
  context: PatientContext;
}

export function PatientHeaderBar({ context }: PatientHeaderBarProps) {
  const hasInfo = Object.values(context).some((v) => v?.trim());

  if (!hasInfo) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <UserRound className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          No patient information provided
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border bg-blue-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-blue-900">
            {context.patientName || 'Unknown Patient'}
          </span>
        </div>

        {context.patientMrn && (
          <Field label="MRN" value={context.patientMrn} />
        )}
        {context.age && (
          <Field
            label="Age/Gender"
            value={`${context.age}${context.gender ? ` / ${context.gender}` : ''}`}
          />
        )}
        {!context.age && context.gender && (
          <Field label="Gender" value={context.gender} />
        )}
        {context.encounterId && (
          <Field label="Encounter" value={context.encounterId} />
        )}
        {context.department && (
          <Field label="Dept" value={context.department} />
        )}
        {context.consultantName && (
          <Field label="Consultant" value={context.consultantName} />
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="text-blue-600/70">{label}: </span>
      <span className="font-medium text-blue-900">{value}</span>
    </div>
  );
}
