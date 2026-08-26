import { describe, expect, it } from 'vitest';
import { getPdfToJsonFormsPrompt } from './pdf-to-jsonforms-prompt';

// Mirror of OMF_CONTROL_NAMES in packages/form-core/src/registry/control-registry.ts
// (this app deliberately has no workspace dependency, so the list is pinned by
// value). Both renderers have parity tests proving they claim every one of
// these — keep the three lists identical.
const CANONICAL_CONTROLS = [
  'textarea',
  'radio',
  'checkboxGroup',
  'scoringMatrix',
  'vitalSignsChart',
  'colorCodedGrid',
  'riskStratification',
  'signatureDate',
  'clinicalReferenceTable',
  'checklistMatrix',
  'scoreSummary',
  'recordTable',
];

describe('getPdfToJsonFormsPrompt', () => {
  it('allows exactly the canonical omf.control vocabulary both renderers implement', () => {
    const prompt = getPdfToJsonFormsPrompt();
    const line = prompt
      .split('\n')
      .find((l) => l.includes('omf.control values you may use:'));
    expect(line).toBeDefined();
    const allowed = [...line!.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...CANONICAL_CONTROLS].sort());
  });

  it('keeps the widget faithful to the source for scored single-selects', () => {
    // The regression this guards: the scored-select example used to hardcode
    // "control": "radio", and the model copied it — a form whose source drew
    // six <select> dropdowns came back as six radio groups.
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('The WIDGET follows the SOURCE');
    expect(prompt).toContain(
      'add "control": "radio" to the omf bag ONLY when the source draws mutually-exclusive radio circles',
    );
    expect(prompt).toContain('Do not switch a source dropdown to radios because the field is scored');
    // The example itself must not carry the radio override — models copy examples.
    const example = prompt.split('SCORED SINGLE-SELECT')[1]?.split('NEVER bake')[0] ?? '';
    expect(example).toContain('optionPoints');
    expect(example).not.toContain('"control": "radio",');
  });

  it('requires layouts to be inferred from the uploaded source, not a fixed template', () => {
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('SOURCE-DRIVEN LAYOUT');
    expect(prompt).toContain('do NOT apply a fixed clinical template');
    expect(prompt).toContain('Treat each source page independently');
    expect(prompt).toContain('Do not invent columns');
  });
  it('teaches a rule on an OmfTableRow for a stepwise assessment', () => {
    // The CAM-ICU regression: Features 2-4 are separate table rows revealed one
    // at a time. Without this the model puts the rule on the Controls inside a
    // row (leaving an empty row on screen) or omits it and asks everything at
    // once.
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('A rule may also sit on a LAYOUT element');
    expect(prompt).toContain('the rule belongs on the ROW and never on the Controls inside it');
    expect(prompt).toContain('a gated step is a real step');
  });
  it('teaches root-scope conditions for a computed outcome', () => {
    // The CAM-ICU result banner: its text lived only in the page's script, so
    // the outcome has to be rebuilt from the rule the form states in prose.
    // Without this the model has no way to express "F1 AND F2 AND (F3 OR F4)"
    // and falls back to emitting the dead placeholder string as a Label.
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('MULTI-FIELD CONDITIONS');
    expect(prompt).toContain('a condition "scope" of "#" matches the WHOLE response object');
    expect(prompt).toContain('"anyOf" for OR');
    // required, or an unfilled form shows every outcome at once.
    expect(prompt).toContain('shows no outcome at all rather than a false one');
    expect(prompt).toContain('Outcomes must be mutually exclusive');
    // A numeric instrument must not be dragged into this shape.
    expect(prompt).toContain('a numeric total mapped to risk bands is "scoreSummary"');
  });
  it('routes a scored threshold to section bands, not to a Label rule', () => {
    // The Sepsis sheet: qSOFA and SIRS each print their own "Positive if >= 2"
    // beside their own total. Without this the model either invents a
    // form-wide scoreSummary that adds the two instruments together, or emits
    // the dead "Pending" placeholder its script would have replaced.
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('SCORED THRESHOLDS');
    expect(prompt).toContain('put "bands" on that block\'s Group');
    expect(prompt).toContain('you must NOT total them together');
    expect(prompt).toContain('stratifies the WHOLE form');
    // The other half of the routing: a typed number has no section total.
    expect(prompt).toContain('there is no section total to band');
  });
});
