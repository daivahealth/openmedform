import { describe, it, expect } from 'vitest';
import { rrtSbarReference } from '@openmedform/form-core';
import { renderPrintHtml } from './render-html';

describe('renderPrintHtml (A4 reconstruction)', () => {
  const html = renderPrintHtml(rrtSbarReference);

  it('emits an A4 @page with the schema mm margins', () => {
    expect(html).toContain('@page { size: A4 portrait; margin: 12mm 10mm 12mm 10mm; }');
  });

  it('renders the form title and section groups', () => {
    expect(html).toContain('ΑΝΑΦΟΡΑ ΟΜΑΔΑΣ ΑΜΕΣΗΣ ΑΝΤΑΠΟΚΡΙΣΗΣ');
    expect(html).toContain('Στοιχεία Κλήσης'); // call-details group legend
  });

  it('renders booleans as print-safe checkbox glyphs', () => {
    expect(html).toContain('☐');
  });

  it('prints option labels, not the stored codes', () => {
    // The printed sheet is read by a clinician; `CRUTCHES_CANE_WALKER_15` on
    // paper is as wrong as it is on screen.
    const html = renderPrintHtml(
      {
        ...rrtSbarReference,
        dataSchema: {
          type: 'object',
          properties: {
            ambulatoryAid: {
              title: 'Ambulatory aid',
              oneOf: [
                { const: 'NONE_BEDREST_NURSE_ASSIST', title: 'None/bedrest/nurse assist' },
                { const: 'CRUTCHES_CANE_WALKER', title: 'Crutches/Cane/Walker' },
              ],
            },
          },
        },
        uiSchema: {
          schemaVersion: '1.0',
          layout: {
            type: 'VerticalLayout',
            elements: [
              {
                type: 'Control',
                scope: '#/properties/ambulatoryAid',
                options: { omf: { control: 'radio' } },
              },
            ],
          },
        },
      } as never,
      { data: { ambulatoryAid: 'CRUTCHES_CANE_WALKER' } },
    );

    expect(html).toContain('Crutches/Cane/Walker');
    expect(html).not.toContain('NONE_BEDREST_NURSE_ASSIST');
    // …and the ticked box sits against the selected option.
    expect(html).toMatch(/☑<\/span>Crutches\/Cane\/Walker/);
  });

  it('renders the AVPU radio options inline from the enum', () => {
    expect(html).toContain('ALERT');
    expect(html).toContain('UNRESPONSIVE');
  });

  it('gives textarea controls a mm min-height box from omf.print', () => {
    expect(html).toMatch(/min-height:30mm/); // situation: print.minHeightMm 30
  });

  it('pre-fills provided data', () => {
    const filled = renderPrintHtml(rrtSbarReference, {
      data: { assessment: { avpu: 'ALERT' }, situation: 'Tachycardia' },
    });
    expect(filled).toContain('Tachycardia');
    // selected radio uses the checked glyph
    expect(filled).toContain('☑');
  });

  it('escapes HTML in values', () => {
    const filled = renderPrintHtml(rrtSbarReference, { data: { situation: '<script>x</script>' } });
    expect(filled).not.toContain('<script>x');
    expect(filled).toContain('&lt;script&gt;');
  });

  it('preserves line breaks in a multi-line bulleted Label', () => {
    const out = renderPrintHtml({
      ...rrtSbarReference,
      dataSchema: { type: 'object', properties: {} },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Label', text: '- Να πάρει ελαφρύ πρωινό\n- Να έχει τις εξετάσεις\n- Να μην χρησιμοποιεί μακιγιάζ' },
          ],
        },
      } as never,
    });
    // The label block opts into line-break preservation …
    expect(out).toContain('white-space: pre-line');
    // … and the source newlines survive into the markup (not collapsed).
    expect(out).toContain('- Να πάρει ελαφρύ πρωινό\n- Να έχει τις εξετάσεις\n- Να μην χρησιμοποιεί μακιγιάζ');
  });
});

describe('renderPrintHtml — conditional rules', () => {
  /** CAM-ICU's shape: a gating select and a row asked only if it is present. */
  const stepwise = {
    ...rrtSbarReference,
    dataSchema: {
      type: 'object',
      properties: {
        feature1: { type: 'string', title: 'Feature 1' },
        feature2: { type: 'string', title: 'Feature 2' },
      },
    },
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'OmfTableLayout',
        elements: [
          {
            type: 'OmfTableRow',
            label: 'Feature 1',
            elements: [{ type: 'Control', scope: '#/properties/feature1' }],
          },
          {
            type: 'OmfTableRow',
            label: 'Feature 2',
            elements: [{ type: 'Control', scope: '#/properties/feature2' }],
            rule: {
              effect: 'SHOW',
              condition: { scope: '#/properties/feature1', schema: { const: 'PRESENT' } },
            },
          },
        ],
      },
    },
  } as never;

  it('prints every conditional section on a BLANK form', () => {
    // A blank sheet is printed to be filled in by hand. Applying rules against
    // no data would print Feature 1 alone and make the paper form unusable.
    const out = renderPrintHtml(stepwise);
    expect(out).toContain('Feature 1');
    expect(out).toContain('Feature 2');
  });

  it('omits a section the response never triggered', () => {
    // A completed submission is a clinical record: a question that was never
    // asked must not appear on it as if it had been.
    const out = renderPrintHtml(stepwise, { data: { feature1: 'ABSENT' } });
    expect(out).toContain('Feature 1');
    expect(out).not.toContain('Feature 2');
  });

  it('prints it once the response triggers it', () => {
    const out = renderPrintHtml(stepwise, { data: { feature1: 'PRESENT', feature2: 'ABSENT' } });
    expect(out).toContain('Feature 2');
  });

  it('honours an explicit override in both directions', () => {
    const forced = renderPrintHtml(stepwise, { data: { feature1: 'ABSENT' }, rules: 'ignore' });
    expect(forced).toContain('Feature 2');

    const blankApplied = renderPrintHtml(stepwise, { rules: 'apply' });
    expect(blankApplied).not.toContain('Feature 2');
  });

  it('gates a Group and a Control the same way, not just a table row', () => {
    const def = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', title: 'Trigger' },
          detail: { type: 'string', title: 'Detail field' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/trigger' },
            {
              type: 'Group',
              label: 'Follow-up section',
              elements: [{ type: 'Control', scope: '#/properties/detail' }],
              rule: {
                effect: 'SHOW',
                condition: { scope: '#/properties/trigger', schema: { const: 'YES' } },
              },
            },
          ],
        },
      },
    } as never;

    expect(renderPrintHtml(def, { data: { trigger: 'NO' } })).not.toContain('Follow-up section');
    expect(renderPrintHtml(def, { data: { trigger: 'YES' } })).toContain('Follow-up section');
  });

  it('still prints a DISABLE-ruled field — enablement has no meaning on paper', () => {
    const def = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          trigger: { type: 'string', title: 'Trigger' },
          locked: { type: 'string', title: 'Locked field' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/trigger' },
            {
              type: 'Control',
              scope: '#/properties/locked',
              rule: {
                effect: 'DISABLE',
                condition: { scope: '#/properties/trigger', schema: { const: 'YES' } },
              },
            },
          ],
        },
      },
    } as never;

    expect(renderPrintHtml(def, { data: { trigger: 'YES' } })).toContain('Locked field');
  });
});

describe('renderPrintHtml — section score and verdict', () => {
  const qsofa = {
    ...rrtSbarReference,
    dataSchema: {
      type: 'object',
      properties: {
        hypotension: { type: 'boolean', title: 'Hypotension' },
        ams: { type: 'boolean', title: 'Altered mental status' },
      },
    },
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'Group',
        label: 'qSOFA (1 pt each)',
        options: {
          omf: {
            bands: [
              { maxScore: 1, label: 'Negative' },
              { minScore: 2, label: 'Positive' },
            ],
          },
        },
        elements: [
          { type: 'Control', scope: '#/properties/hypotension', options: { omf: { points: 1 } } },
          { type: 'Control', scope: '#/properties/ams', options: { omf: { points: 1 } } },
        ],
      },
    },
  } as never;

  it('prints the subtotal and the verdict for a filled sheet', () => {
    const out = renderPrintHtml(qsofa, { data: { hypotension: true, ams: true } });
    expect(out).toContain('Σ 2');
    expect(out).toContain('Positive');
  });

  it('follows the band down as well as up', () => {
    const out = renderPrintHtml(qsofa, { data: { hypotension: true } });
    expect(out).toContain('Σ 1');
    expect(out).toContain('Negative');
  });

  it('prints NEITHER on a blank form', () => {
    // "Σ 0 — Negative" beside an unfilled qSOFA box is not a neutral
    // placeholder, it is a wrong clinical reading of a sheet nobody has
    // answered yet.
    const out = renderPrintHtml(qsofa);
    expect(out).not.toContain('Σ 0');
    expect(out).not.toContain('Negative');
    // …but the section itself still prints, ready to fill in by hand.
    expect(out).toContain('qSOFA (1 pt each)');
  });

  it('prints the subtotal alone when a section declares no bands', () => {
    const noBands = {
      ...qsofa,
      uiSchema: {
        schemaVersion: '1.0',
        layout: { ...(qsofa as never as { uiSchema: { layout: Record<string, unknown> } }).uiSchema.layout, options: undefined },
      },
    } as never;
    const out = renderPrintHtml(noBands, { data: { hypotension: true, ams: true } });
    expect(out).toContain('Σ 2');
    expect(out).not.toContain('Positive');
  });
});

describe('renderPrintHtml — callout labels', () => {
  const withLabel = (options?: Record<string, unknown>) =>
    ({
      ...rrtSbarReference,
      dataSchema: { type: 'object', properties: {} },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Label', text: 'Overall result: CAM-ICU POSITIVE', ...(options ? { options } : {}) },
          ],
        },
      },
    }) as never;

  it('prints an accented Label as a bordered, tinted callout', () => {
    const out = renderPrintHtml(withLabel({ omf: { accentColor: '#b3392c' } }));

    expect(out).toContain('<div class="omf-callout"');
    expect(out).toContain('color:#b3392c');
    // Opaque tint, not rgba: print pipelines routinely drop alpha compositing,
    // and a callout whose background vanishes takes its meaning with it.
    expect(out).toContain('background:rgb(249, 239, 238)');
    expect(out).not.toContain('rgba(');
    expect(out).toContain('print-color-adjust: exact');
  });

  it('leaves a Label without an accent as plain text', () => {
    // The callout CSS is always in the stylesheet; what matters is which class
    // the element actually carries.
    const out = renderPrintHtml(withLabel());
    expect(out).toContain('<div class="omf-section-label">Overall result');
    expect(out).not.toContain('<div class="omf-callout"');
  });

  it('keeps border and text when the accent yields no tint', () => {
    const out = renderPrintHtml(withLabel({ omf: { accentColor: 'var(--bad)' } }));
    expect(out).toContain('<div class="omf-callout"');
    expect(out).toContain('border-color:var(--bad)');
    expect(out).not.toContain('background:rgb');
  });
});
