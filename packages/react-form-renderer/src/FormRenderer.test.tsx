import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { rrtSbarReference } from '@openmedform/form-core';
import type { FormioFormDefinition } from '@openmedform/form-schema-types';

// Stub the preserved Form.io renderer so the routing test does not boot Form.io
// (which dynamically imports the heavy formio-core engine).
vi.mock('@openmedform/renderer', () => ({
  FormRenderer: (props: { schema: unknown }) => (
    <div data-testid="formio-branch">formio:{JSON.stringify(props.schema)}</div>
  ),
}));

afterEach(cleanup);

const { FormRenderer } = await import('./FormRenderer');

describe('FormRenderer engine dispatcher', () => {
  it('routes a formio definition to the preserved Form.io renderer', () => {
    const def: FormioFormDefinition = {
      id: 'f1',
      formCode: 'X.1',
      name: 'Legacy',
      version: '1.0',
      language: 'en',
      status: 'PUBLISHED',
      engine: 'formio',
      schema: { display: 'form', components: [{ type: 'textfield', key: 'a' }] },
      audit: { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
    };

    render(<FormRenderer definition={def} />);
    const branch = screen.getByTestId('formio-branch');
    expect(branch.textContent).toContain('formio:');
    expect(branch.textContent).toContain('textfield');
  });

  it('routes a jsonforms definition to the JSON Forms renderer', () => {
    render(<FormRenderer definition={rrtSbarReference} />);
    // Form.io branch must NOT be used for a jsonforms definition.
    expect(screen.queryByTestId('formio-branch')).toBeNull();
    // JSON Forms output is present.
    expect(document.querySelectorAll('textarea').length).toBeGreaterThan(0);
  });
});
