import { useMemo, useState } from 'react';
import { FormRenderer, ReviewSurface } from '@openmedform/react-form-renderer';
import { rrtSbarReference } from '@openmedform/form-core';
import type { FormDefinition } from '@openmedform/form-schema-types';
import { vteSample } from './vte-sample';
import { signoffSample } from './signoff-sample';
import { chemoLogSample } from './chemo-log-sample';
import { vipCannulaSample } from './vip-cannula-sample';
import { bloodSugarSample } from './blood-sugar-sample';

type Mode = 'jsonforms' | 'vte' | 'table' | 'chemo' | 'vip' | 'bgs' | 'review';

const definitions: Record<'jsonforms' | 'vte' | 'table' | 'chemo' | 'vip' | 'bgs', FormDefinition> = {
  jsonforms: rrtSbarReference,
  vte: vteSample,
  table: signoffSample,
  chemo: chemoLogSample,
  vip: vipCannulaSample,
  bgs: bloodSugarSample,
};
const modes: Mode[] = ['jsonforms', 'vte', 'table', 'chemo', 'vip', 'bgs', 'review'];

export function App() {
  const [engine, setEngine] = useState<Mode>('jsonforms');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [refining, setRefining] = useState(false);
  const dataPreview = useMemo(() => JSON.stringify(data, null, 2), [data]);

  if (engine === 'review') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <ModeTabs engine={engine} onSelect={setEngine} />
        <p style={{ color: '#555', marginTop: 0 }}>
          Phase 7 review surface: live preview + low-confidence fields/warnings + prompt-based refine.
        </p>
        <ReviewSurface
          definition={rrtSbarReference}
          refining={refining}
          onRefine={(instruction) => {
            // Demo stub: the real UI streams this to POST /forms/:id/jsonforms/refine.
            setRefining(true);
            window.setTimeout(() => setRefining(false), 900);
            console.log('refine instruction:', instruction);
          }}
          onAccept={() => console.log('accept conversion')}
        />
      </div>
    );
  }

  const definition = definitions[engine];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>OpenMedForm — Dual-Engine React Demo</h1>
        <p style={{ color: '#555', marginTop: 4 }}>
          The same <code>&lt;FormRenderer definition=&#123;...&#125; /&gt;</code> seam renders both engines.
        </p>
      </header>

      <ModeTabs engine={engine} onSelect={(m) => { setEngine(m); setData({}); }} />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        <section style={{ border: '1px solid #e2e5ea', borderRadius: 8, padding: 16, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>{definition.name}</h2>
          <FormRenderer definition={definition} data={data} onChange={(next) => setData(next)} />
        </section>

        <aside style={{ position: 'sticky', top: 16 }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', color: '#666' }}>Live data</h3>
          <pre
            style={{
              background: '#0f1420',
              color: '#d6e2f0',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              maxHeight: 480,
              overflow: 'auto',
            }}
          >
            {dataPreview}
          </pre>
        </aside>
      </div>
    </div>
  );
}

function ModeTabs({ engine, onSelect }: { engine: Mode; onSelect: (m: Mode) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {modes.map((key) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid #c8cdd4',
            background: key === engine ? '#1c2430' : '#fff',
            color: key === engine ? '#fff' : '#1c2430',
            cursor: 'pointer',
          }}
        >
          {key === 'review' ? 'review surface' : key === 'vte' ? 'vte checklist' : key === 'table' ? 'table columns' : key === 'chemo' ? 'treatment log' : key === 'vip' ? 'cannula chart' : key === 'bgs' ? 'blood sugar' : `${key} engine`}
        </button>
      ))}
    </div>
  );
}
