'use client';

import dynamic from 'next/dynamic';

const FormRendererWrapper = dynamic(
  () => import('./form-renderer-wrapper').then((m) => ({ default: m.FormRendererWrapper })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  },
);

const JsonFormsRendererWrapper = dynamic(
  () => import('./jsonforms-renderer-wrapper').then((m) => ({ default: m.JsonFormsRendererWrapper })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  },
);

interface AnyForm {
  id: string;
  slug?: string;
  name: string;
  status?: string;
  currentVersion?: { engine?: string; schema?: unknown } | null;
  versions?: { engine?: string; schema?: unknown }[];
}

interface Props {
  form: AnyForm;
  submission?: object;
  data?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  onSubmit?: (data: object) => void;
  readOnly?: boolean;
}

/** Returns the engine of a form's active version ('FORMIO' | 'JSONFORMS'). */
export function formEngine(form: AnyForm): string {
  return (form.currentVersion?.engine ?? form.versions?.[0]?.engine ?? 'FORMIO').toUpperCase();
}

/**
 * Engine-aware renderer for the web app: routes jsonforms forms to the shared
 * JSON Forms renderer and Form.io forms to the preserved Form.io wrapper. The
 * Form.io wrapper owns its own submit button; jsonforms has none, so callers
 * render their own submit control for that engine (see the fill page).
 */
export function DualFormRenderer({ form, submission, data, onChange, onSubmit, readOnly }: Props) {
  if (formEngine(form) === 'JSONFORMS') {
    return (
      <JsonFormsRendererWrapper form={form} data={data} onChange={onChange} readOnly={readOnly} />
    );
  }

  const schema = (form.currentVersion?.schema ?? { display: 'form', components: [] }) as object;
  return (
    <FormRendererWrapper
      schema={schema}
      submission={submission}
      onChange={onChange as ((data: object) => void) | undefined}
      onSubmit={onSubmit}
      readOnly={readOnly}
    />
  );
}
