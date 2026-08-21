import { describe, expect, it } from 'vitest';
import type { UISchemaElement } from '@jsonforms/core';
import { OMF_CONTROL_NAMES } from '@openmedform/form-core';
import { OMF_CONTROL_RANK, omfControlTesters } from './testers';

/**
 * Parity guard: every name in the canonical omf.control vocabulary must be
 * claimed by its tester at custom-control rank. The React renderer runs the
 * equivalent test against its full registry, so a control added to
 * OMF_CONTROL_NAMES (or to the AI prompt, which is pinned to the same list)
 * cannot ship implemented in only one framework.
 *
 * This asserts on `omfControlTesters` rather than the renderer set because
 * @jsonforms/angular cannot load under vitest; the map's
 * `satisfies Record<OmfControlName, …>` plus the renderer set registering from
 * the same map make coverage of the set itself a compile-time guarantee.
 */
describe('canonical omf.control vocabulary coverage', () => {
  const schema = { type: 'object', properties: { x: { type: 'string' } } };
  const context = { rootSchema: schema, config: {} };

  it.each([...OMF_CONTROL_NAMES])('the "%s" tester claims its control', (name) => {
    const el = {
      type: 'Control',
      scope: '#/properties/x',
      options: { omf: { control: name } },
    } as unknown as UISchemaElement;
    const rank = omfControlTesters[name](el, schema as never, context as never);
    expect(rank).toBeGreaterThanOrEqual(OMF_CONTROL_RANK);
  });

  it('has a tester for every canonical name and no strays', () => {
    expect(Object.keys(omfControlTesters).sort()).toEqual([...OMF_CONTROL_NAMES].sort());
  });
});
