/**
 * Review surface for AI-converted jsonforms definitions (Phase 7).
 *
 * Reviewer-facing, NOT drag-and-drop: it shows the live rendered preview beside
 * the conversion's low-confidence fields and warnings (so uncertain elements are
 * never missed), an optional source-PDF pane, and a natural-language refine box
 * that drives the prompt-based designer. Accept/publish are wired by the host via
 * the `onAccept` / `onRefine` callbacks.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { cssVariables } from '@openmedform/form-design-tokens';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';

/** Fields at/below this detection confidence are flagged for review. */
const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

interface FieldMeta {
  binding: string;
  sourcePage?: number;
  confidence?: number;
  warnings?: { type: string; message: string }[];
}

export interface ReviewSurfaceProps {
  definition: JsonFormsFormDefinition;
  /** Natural-language refinement (prompt-based designer). */
  onRefine?: (instruction: string) => void | Promise<void>;
  refining?: boolean;
  /** Accept the conversion (promote draft out of REVIEW). */
  onAccept?: () => void | Promise<void>;
  /** Optional source PDF/image URL to show side-by-side. */
  sourceUrl?: string;
}

const tokenStyle = cssVariables as unknown as CSSProperties;
const card: CSSProperties = {
  border: '1px solid var(--omf-color-border, #c8cdd4)',
  borderRadius: 'var(--omf-border-radius, 4px)',
  padding: 'var(--omf-section-padding, 16px)',
};

export function ReviewSurface({ definition, onRefine, refining, onAccept, sourceUrl }: ReviewSurfaceProps) {
  const [instruction, setInstruction] = useState('');

  const meta = definition.conversionMetadata;
  const fields = (meta?.fields ?? []) as FieldMeta[];
  const formWarnings = (meta?.warnings ?? []) as { type: string; message: string }[];

  const lowConfidence = useMemo(
    () => fields.filter((f) => typeof f.confidence === 'number' && f.confidence <= REVIEW_CONFIDENCE_THRESHOLD),
    [fields],
  );
  const fieldWarningCount = useMemo(
    () => fields.reduce((n, f) => n + (f.warnings?.length ?? 0), 0),
    [fields],
  );

  const submitRefine = () => {
    if (instruction.trim() && onRefine) {
      void onRefine(instruction.trim());
      setInstruction('');
    }
  };

  return (
    <div className="omf-review-surface" style={{ ...tokenStyle, fontFamily: 'var(--omf-font-family)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{definition.name}</h2>
          <span style={{ fontSize: 12, color: 'var(--omf-color-label)' }}>
            {definition.formCode} · v{definition.version} · {definition.status}
          </span>
        </div>
        {onAccept && (
          <button
            onClick={() => void onAccept()}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#1c7a3f',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Accept &amp; save draft
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sourceUrl ? '1fr 1fr 320px' : '1fr 320px', gap: 16, alignItems: 'start' }}>
        {sourceUrl && (
          <section style={card}>
            <h3 style={{ marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--omf-color-label)' }}>Source</h3>
            <iframe title="source" src={sourceUrl} style={{ width: '100%', height: 520, border: 'none' }} />
          </section>
        )}

        <section style={card}>
          <h3 style={{ marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--omf-color-label)' }}>Preview</h3>
          <JsonFormsRenderer definition={definition} />
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={card}>
            <h3 style={{ marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--omf-color-label)' }}>
              Review ({lowConfidence.length} low-confidence · {fieldWarningCount + formWarnings.length} warnings)
            </h3>
            {lowConfidence.length === 0 && formWarnings.length === 0 && fieldWarningCount === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--omf-color-label)' }}>Nothing flagged — looks clean.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lowConfidence.map((f) => (
                  <li key={f.binding} style={{ borderLeft: '3px solid var(--omf-color-invalid, #c0392b)', paddingLeft: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{f.binding}</div>
                    <div style={{ fontSize: 12, color: 'var(--omf-color-invalid)' }}>
                      confidence {Math.round((f.confidence ?? 0) * 100)}%
                    </div>
                    {(f.warnings ?? []).map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--omf-color-label)' }}>⚠ {w.type}: {w.message}</div>
                    ))}
                  </li>
                ))}
                {formWarnings.map((w, i) => (
                  <li key={`fw-${i}`} style={{ fontSize: 12, color: 'var(--omf-color-label)' }}>⚠ {w.type}: {w.message}</li>
                ))}
              </ul>
            )}
          </section>

          {onRefine && (
            <section style={card}>
              <h3 style={{ marginTop: 0, fontSize: 13, textTransform: 'uppercase', color: 'var(--omf-color-label)' }}>Refine (AI)</h3>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Make the AVPU field required and add a Greek label for 'Recommendation'"
                rows={3}
                disabled={refining}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, fontSize: 13 }}
              />
              <button
                onClick={submitRefine}
                disabled={refining || !instruction.trim()}
                style={{ marginTop: 8, padding: '8px 14px', borderRadius: 6, border: '1px solid var(--omf-color-border)', cursor: 'pointer' }}
              >
                {refining ? 'Refining…' : 'Apply refinement'}
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
