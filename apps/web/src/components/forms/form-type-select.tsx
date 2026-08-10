'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ClipboardList, UserRound } from 'lucide-react';

export type FormTypeValue = 'PATIENT' | 'NON_PATIENT';

interface FormTypeSelectProps {
  value: FormTypeValue;
  onChange: (value: FormTypeValue) => void;
  /** Prefix for the option ids, so two of these can coexist on a page. */
  idPrefix?: string;
}

/**
 * Patient / Non-Patient picker. Shared by both create-a-form dialogs so the
 * choice is worded, drawn and defaulted identically whichever door the user
 * came through — the file route used to skip it entirely and let the server
 * default decide.
 */
export function FormTypeSelect({ value, onChange, idPrefix = 'form-type' }: FormTypeSelectProps) {
  return (
    <div className="grid gap-2">
      <Label>Form Type</Label>
      <div className="grid grid-cols-2 gap-3">
        <FormTypeOption
          id={`${idPrefix}-patient`}
          selected={value === 'PATIENT'}
          onSelect={() => onChange('PATIENT')}
          icon={UserRound}
          title="Patient Form"
          hint="Tied to a patient encounter"
        />
        <FormTypeOption
          id={`${idPrefix}-non-patient`}
          selected={value === 'NON_PATIENT'}
          onSelect={() => onChange('NON_PATIENT')}
          icon={ClipboardList}
          title="Non-Patient Form"
          hint="OT checklist, audit, etc."
        />
      </div>
    </div>
  );
}

interface FormTypeOptionProps {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon: typeof UserRound;
  title: string;
  hint: string;
}

function FormTypeOption({
  id,
  selected,
  onSelect,
  icon: Icon,
  title,
  hint,
}: FormTypeOptionProps) {
  return (
    <button
      id={id}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30',
      )}
    >
      <Icon className={cn('h-6 w-6', selected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
