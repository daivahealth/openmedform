import { describe, expect, it } from 'vitest';
import { getPdfToJsonFormsPrompt } from './pdf-to-jsonforms-prompt';

describe('getPdfToJsonFormsPrompt', () => {
  it('requires layouts to be inferred from the uploaded source, not a fixed template', () => {
    const prompt = getPdfToJsonFormsPrompt();

    expect(prompt).toContain('SOURCE-DRIVEN LAYOUT');
    expect(prompt).toContain('do NOT apply a fixed clinical template');
    expect(prompt).toContain('Treat each source page independently');
    expect(prompt).toContain('Do not invent columns');
  });
});
