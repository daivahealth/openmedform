'use client';

import { useEffect, useRef, useState } from 'react';
import { loadFormioCss } from '@/lib/formio-css';

interface FormRendererWrapperProps {
  schema: object;
  submission?: object;
  onSubmit?: (data: object) => void;
  onChange?: (data: object) => void;
  readOnly?: boolean;
}

export function FormRendererWrapper({
  schema,
  submission,
  onSubmit,
  onChange,
  readOnly = false,
}: FormRendererWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFormioCss();

    let destroyed = false;

    async function initForm() {
      if (!containerRef.current) return;

      const mod = await import('@openmedform/formio-core');
      const Formio = mod.Formio ?? mod.default?.Formio ?? mod.default;

      const { registerClinicalComponents } = await import('@/lib/clinical-components');
      registerClinicalComponents(Formio);

      if (destroyed || !containerRef.current) return;

      const formOptions: Record<string, unknown> = {
        readOnly,
      };

      const form = await Formio.createForm(
        containerRef.current,
        schema,
        formOptions,
      );

      if (destroyed) {
        form.destroy();
        return;
      }

      formRef.current = form;
      setLoading(false);

      if (submission) {
        form.submission = { data: submission };
      }

      if (onSubmit) {
        form.on('submit', (submissionData: object) => {
          onSubmit(submissionData);
        });
      }

      if (onChange) {
        form.on('change', (changed: object) => {
          onChange(changed);
        });
      }
    }

    initForm();

    return () => {
      destroyed = true;
      if (formRef.current) {
        formRef.current.destroy();
        formRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, readOnly]);

  return (
    <div className="formio-renderer-scope relative min-h-[200px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading form...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
