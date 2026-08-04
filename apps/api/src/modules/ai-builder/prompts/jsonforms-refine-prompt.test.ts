import { describe, expect, it } from 'vitest';
import { getJsonFormsRefineSystemPrompt } from './jsonforms-refine-prompt';

describe('getJsonFormsRefineSystemPrompt', () => {
  it('offers PATCH mode with a strict contract, defaulting full mode to rewrites', () => {
    const prompt = getJsonFormsRefineSystemPrompt();

    expect(prompt).toContain('"mode": "patch"');
    expect(prompt).toContain('RFC 6902');
    expect(prompt).toContain('Allowed ops: add, replace, remove, move, copy');
    expect(prompt).toContain('use "-" to append');
    // The escape rules are where model patches most often go wrong.
    expect(prompt).toContain('"/" in a key is "~1"');
    expect(prompt).toContain('If unsure, use FULL mode');
  });

  it('asks the model to narrate what it changed, truthfully', () => {
    const prompt = getJsonFormsRefineSystemPrompt();

    expect(prompt).toContain('"changeSummary"');
    expect(prompt).toContain('describing exactly what you changed');
    expect(prompt).toContain('If part of the\n  request could not be applied, say which part and why');
    expect(prompt).toContain('never claim more');
  });

  it('requires every refinement to repair invalid nested Control scopes', () => {
    const prompt = getJsonFormsRefineSystemPrompt();

    expect(prompt).toContain('repair every invalid nested JSON Forms Control scope');
    expect(prompt).toContain('#/properties/reasonForCall/properties/pulseLessThan40');
    expect(prompt).toContain('Do not add, remove,');
    expect(prompt).toContain('rename, or translate fields while repairing scopes');
  });
});
