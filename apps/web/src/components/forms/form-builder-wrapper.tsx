'use client';

import { useEffect, useRef, useState } from 'react';
import { loadFormioCss } from '@/lib/formio-css';

interface FormBuilderWrapperProps {
  initialSchema: object;
  onSchemaChange: (schema: object) => void;
  options?: object;
  sidebarCollapsed?: boolean;
}

const defaultOptions = {
  builder: {
    basic: { default: true },
    advanced: { default: true },
    layout: { default: true },
    data: { default: true },
    premium: false,
  },
  noNewEdit: false,
  noDefaultSubmitButton: true,
};

export function FormBuilderWrapper({
  initialSchema,
  onSchemaChange,
  options,
  sidebarCollapsed,
}: FormBuilderWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const builderRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFormioCss();

    let destroyed = false;

    async function initBuilder() {
      if (!containerRef.current) return;

      const mod = await import('@openmedform/formio-core');
      const Formio = mod.Formio ?? mod.default?.Formio ?? mod.default;

      const { registerClinicalComponents, clinicalBuilderConfig } = await import('@/lib/clinical-components');
      registerClinicalComponents(Formio);

      if (destroyed || !containerRef.current) return;

      const mergedOptions = {
        ...defaultOptions,
        ...options,
        builder: {
          ...defaultOptions.builder,
          ...(options as any)?.builder,
          ...clinicalBuilderConfig,
        },
      };

      const builder = await Formio.builder(
        containerRef.current,
        initialSchema,
        mergedOptions,
      );

      if (destroyed) {
        builder.destroy();
        return;
      }

      builderRef.current = builder;
      setLoading(false);

      builder.on('change', (schema: object) => {
        onSchemaChange(schema);
      });
    }

    initBuilder();

    return () => {
      destroyed = true;
      if (builderRef.current) {
        builderRef.current.destroy();
        builderRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`formio-builder-scope relative min-h-[500px]${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Loading form builder...
            </p>
          </div>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
