import { useEffect, useRef, useState } from 'react';
import { calculateScores, type ScoringRules } from '@openmedform/shared';
import { loadRendererCss } from './load-css';
import { registerClinicalComponents } from './register-components';
import type { FormRendererProps, SubmissionResult } from './types';

export function FormRenderer({
  schema,
  scoringRules,
  patientContext,
  submission,
  onChange,
  onSubmit,
  readOnly = false,
}: FormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRendererCss();

    let destroyed = false;

    async function initForm() {
      if (!containerRef.current) return;

      const mod = await import('@openmedform/formio-core');
      const Formio = mod.Formio ?? mod.default?.Formio ?? mod.default;

      registerClinicalComponents(Formio);

      if (destroyed || !containerRef.current) return;

      const form = await Formio.createForm(
        containerRef.current,
        schema,
        { readOnly },
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

      if (onChange) {
        form.on('change', (changed: any) => {
          const data = changed?.data ?? changed;
          onChange(data);
        });
      }

      if (onSubmit) {
        form.on('submit', (sub: any) => {
          const data = sub?.data ?? sub;
          const result: SubmissionResult = { data, scores: {}, riskLevel: undefined };

          if (scoringRules && Object.keys(scoringRules).length > 0) {
            const scored = calculateScores(
              scoringRules as ScoringRules,
              data,
            );
            result.scores = scored.scores;
            result.riskLevel = scored.riskLevel;
          }

          onSubmit(result);
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
  }, [schema, readOnly]);

  return (
    <div className="omf-renderer-scope" style={{ position: 'relative', minHeight: 200 }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.8)',
            zIndex: 10,
          }}
        >
          <span>Loading form...</span>
        </div>
      )}
      {patientContext && Object.values(patientContext).some((v) => v?.trim()) && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#eff6ff',
            borderRadius: 8,
            border: '1px solid #bfdbfe',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 24px',
            fontSize: 14,
          }}
        >
          {patientContext.patientName && (
            <span><strong>{patientContext.patientName}</strong></span>
          )}
          {patientContext.patientMrn && (
            <span>MRN: <strong>{patientContext.patientMrn}</strong></span>
          )}
          {patientContext.age && (
            <span>Age: <strong>{patientContext.age}{patientContext.gender ? ` / ${patientContext.gender}` : ''}</strong></span>
          )}
          {patientContext.encounterId && (
            <span>Encounter: <strong>{patientContext.encounterId}</strong></span>
          )}
          {patientContext.department && (
            <span>Dept: <strong>{patientContext.department}</strong></span>
          )}
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
