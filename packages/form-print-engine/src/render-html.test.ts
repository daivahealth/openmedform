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
