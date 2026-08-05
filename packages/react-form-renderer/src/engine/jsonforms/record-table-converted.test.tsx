import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import fixture from './__fixtures__/vip-cannula-converted.json';
import { rrtSbarReference } from '@openmedform/form-core';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './JsonFormsRenderer';

/**
 * The VIP cannula chart exactly as the conversion pipeline emitted it (real
 * model output, captured as a fixture) — including its quirks, like the detail
 * layout living under options.omf.detail instead of options.detail. Adding a
 * record took production down for a user, so the whole add-a-record journey is
 * pinned here against the true artifact shape, not a hand-tidied one.
 */
describe('recordTable on a real converted definition', () => {
  const definition = { ...rrtSbarReference, ...fixture } as unknown as JsonFormsFormDefinition;

  it('renders the chart and survives Add record', () => {
    const { container, getByText } = render(<JsonFormsRenderer definition={definition} />);

    const add = Array.from(container.querySelectorAll('button')).find((b) =>
      /add cannula/i.test(b.textContent ?? ''),
    );
    expect(add).toBeTruthy();

    fireEvent.click(add!);

    // A row appeared with its inline-editable cells, and the count updated.
    expect(getByText(/1 cannula/i)).toBeTruthy();
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });
});
