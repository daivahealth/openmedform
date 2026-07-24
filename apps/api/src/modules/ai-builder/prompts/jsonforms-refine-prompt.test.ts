import { describe, expect, it } from 'vitest';
import { getJsonFormsRefineSystemPrompt } from './jsonforms-refine-prompt';

describe('getJsonFormsRefineSystemPrompt', () => {
  it('requires every refinement to repair invalid nested Control scopes', () => {
    const prompt = getJsonFormsRefineSystemPrompt();

    expect(prompt).toContain('repair every invalid nested JSON Forms Control scope');
    expect(prompt).toContain('#/properties/reasonForCall/properties/pulseLessThan40');
    expect(prompt).toContain('Do not add, remove,');
    expect(prompt).toContain('rename, or translate fields while repairing scopes');
  });
});
