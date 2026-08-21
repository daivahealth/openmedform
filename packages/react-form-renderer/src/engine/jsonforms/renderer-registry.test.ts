import { describe, expect, it } from 'vitest';
import type { UISchemaElement } from '@jsonforms/core';
import { OMF_CONTROL_NAMES } from '@openmedform/form-core';
import { rendererRegistry } from './renderer-registry';
import { OMF_CONTROL_RANK } from './testers';

/**
 * Parity guard: every name in the canonical omf.control vocabulary must be
 * claimed by this registry at custom-control rank. The Angular renderer runs
 * the same test against its set, so a control added to OMF_CONTROL_NAMES (or
 * to the AI prompt, which is pinned to the same list) cannot ship implemented
 * in only one framework — the way `[object Object]` radios would have been
 * caught had the two templates been forced through one contract.
 */
describe('renderer registry covers the canonical omf.control vocabulary', () => {
  const schema = { type: 'object', properties: { x: { type: 'string' } } };
  const context = { rootSchema: schema, config: {} };

  it.each([...OMF_CONTROL_NAMES])('claims omf.control "%s"', (name) => {
    const el = {
      type: 'Control',
      scope: '#/properties/x',
      options: { omf: { control: name } },
    } as unknown as UISchemaElement;
    const best = Math.max(
      ...rendererRegistry.map((entry) => entry.tester(el, schema as never, context as never)),
    );
    expect(best).toBeGreaterThanOrEqual(OMF_CONTROL_RANK);
  });
});
