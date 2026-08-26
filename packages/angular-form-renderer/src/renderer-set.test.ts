import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Row-rule parity guard.
 *
 * A rule on an `OmfTableRow` cannot be resolved by the framework — the row IS
 * the layout and never reaches a `<jsonforms-outlet>` — so each renderer has to
 * evaluate it itself. That is exactly the shape that drifts: it was ignored in
 * BOTH renderers until now, and a fix applied to one of them would be invisible
 * from the other's tests.
 *
 * @jsonforms/angular cannot load under vitest, so the component cannot be
 * mounted here (see the note above). What can still be pinned is that the
 * Angular table renderer resolves its rows through form-core's shared
 * `filterVisibleElements` — the same function the React renderer calls and the
 * same evaluation the server uses — rather than re-deriving visibility locally.
 */
describe('OmfTableLayout row rules', () => {
  const source = readFileSync(join(__dirname, 'renderers', 'layouts.ts'), 'utf8');

  it('resolves rows through form-core rather than rendering them unconditionally', () => {
    expect(source).toContain("from '@openmedform/form-core'");
    expect(source).toContain('filterVisibleElements(this.rows');
    // The old unconditional loop must not come back.
    expect(source).not.toContain('@for (row of rows;');
  });

  it('subscribes to the store only when a row actually carries a rule', () => {
    expect(source).toContain('hasElementRules(this.rows)');
  });
});

/**
 * Section-verdict parity guard.
 *
 * `omf.bands` on a scored Group stratify that section's own subtotal, so a
 * Sepsis sheet shows "Σ 2 Positive" on qSOFA and its own verdict on SIRS. The
 * React renderer has a mounted test for this; @jsonforms/angular cannot load
 * under vitest (see above), so what is pinned here is that the Angular group
 * derives its verdict from the SAME form-core call rather than re-deriving the
 * threshold locally — the drift that would make one framework disagree with the
 * other on a clinical result.
 */
describe('section bands', () => {
  const source = readFileSync(join(__dirname, 'renderers', 'layouts.ts'), 'utf8');

  it('reads the section bands through form-core and passes them to computeScore', () => {
    expect(source).toContain('elementBands(this.uischema');
    expect(source).toContain('computeScore(items, data ?? {}, bands)');
  });

  it('renders the verdict from the computed band, not a local comparison', () => {
    expect(source).toContain('score.riskLabel');
    expect(source).toContain('@if (riskLabel)');
    // No hand-rolled threshold: the band table is the only source of a verdict.
    expect(source).not.toMatch(/subtotal\s*>=\s*\d/);
  });
});
