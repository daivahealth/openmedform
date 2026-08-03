import { describe, expect, it } from 'vitest';
import { getPdfToJsonFormsPrompt } from './pdf-to-jsonforms-prompt';

describe('getPdfToJsonFormsPrompt', () => {
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
});
