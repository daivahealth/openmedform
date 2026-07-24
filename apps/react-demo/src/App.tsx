import { useMemo, useState } from 'react';
import { FormRenderer } from '@openmedform/react-form-renderer';
import { rrtSbarReference } from '@openmedform/form-core';
import type { FormDefinition } from '@openmedform/form-schema-types';
import { formioSample } from './formio-sample';

type EngineKey = 'jsonforms' | 'formio';

const definitions: Record<EngineKey, FormDefinition> = {
  jsonforms: rrtSbarReference,
  formio: formioSample,
};

export function App() {
  const [engine, setEngine] = useState<EngineKey>('jsonforms');
  const [data, setData] = useState<Record<string, unknown>>({});
  const definition = definitions[engine];

  const dataPreview = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>OpenMedForm — Dual-Engine React Demo</h1>
        <p style={{ color: '#555', marginTop: 4 }}>
          The same <code>&lt;FormRenderer definition=&#123;...&#125; /&gt;</code> seam renders both engines.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(Object.keys(definitions) as EngineKey[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setEngine(key);
              setData({});
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid #c8cdd4',
              background: key === engine ? '#1c2430' : '#fff',
              color: key === engine ? '#fff' : '#1c2430',
              cursor: 'pointer',
            }}
          >
            {key} engine
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        <section style={{ border: '1px solid #e2e5ea', borderRadius: 8, padding: 16 }}>
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
