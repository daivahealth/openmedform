import { describe, it, expect } from 'vitest';
import type { UiControl, UiCustomElement } from '@openmedform/form-schema-types';
import {
  ControlRegistry,
  NOT_APPLICABLE,
  byOmfControl,
  byOmfLayout,
  byType,
  bySchemaType,
} from './control-registry';

const textarea: UiControl = {
  type: 'Control',
  scope: '#/properties/situation',
  options: { omf: { control: 'textarea' } },
};
const plainControl: UiControl = { type: 'Control', scope: '#/properties/spo2' };
const signature: UiCustomElement = { type: 'OmfSignatureBlock' };

describe('tester factories', () => {
  it('byOmfControl matches on options.omf.control', () => {
    expect(byOmfControl('textarea')(textarea)).toBe(20);
    expect(byOmfControl('textarea')(plainControl)).toBe(NOT_APPLICABLE);
  });
  it('byOmfLayout matches custom Omf element types', () => {
    expect(byOmfLayout('OmfSignatureBlock')(signature)).toBe(15);
    expect(byOmfLayout('OmfSignatureBlock')(plainControl)).toBe(NOT_APPLICABLE);
  });
  it('byType matches standard element types', () => {
    expect(byType('Control')(plainControl)).toBe(5);
  });
  it('bySchemaType matches on resolved field schema type', () => {
    expect(bySchemaType('integer')(plainControl, { fieldSchema: { type: 'integer' } })).toBe(8);
    expect(bySchemaType('integer')(plainControl, { fieldSchema: { type: 'string' } })).toBe(
      NOT_APPLICABLE,
    );
  });
});

describe('ControlRegistry.resolve', () => {
  it('picks the highest-ranked matching renderer', () => {
    const registry = new ControlRegistry<string>()
      .register(byType('Control'), 'default')
      .register(byOmfControl('textarea'), 'textarea');

    expect(registry.resolve(textarea)).toBe('textarea'); // omf (20) beats type (5)
    expect(registry.resolve(plainControl)).toBe('default');
  });

  it('returns undefined when nothing matches', () => {
    const registry = new ControlRegistry<string>().register(byOmfControl('radio'), 'radio');
    expect(registry.resolve(textarea)).toBeUndefined();
  });

  it('supports registerAll / size / clear', () => {
    const registry = new ControlRegistry<string>().registerAll([
      { tester: byType('Control'), renderer: 'a' },
      { tester: byType('Group'), renderer: 'b' },
    ]);
    expect(registry.size).toBe(2);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});
