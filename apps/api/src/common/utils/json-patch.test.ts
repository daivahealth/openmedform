import { describe, expect, it } from 'vitest';
import { applyJsonPatch, JsonPatchError } from './json-patch';

const doc = () => ({
  dataSchema: {
    properties: {
      idBandOn: { type: 'string', title: 'ID Band On' },
      'odd/key~name': { type: 'string' },
    },
  },
  uiSchema: {
    layout: {
      elements: [
        { type: 'Control', scope: '#/properties/idBandOn' },
        { type: 'Group', label: 'Vitals', options: { omf: {} } },
      ],
    },
  },
});

describe('applyJsonPatch', () => {
  it('replaces, adds, and removes — the bread-and-butter refine edits', () => {
    const result = applyJsonPatch(doc(), [
      { op: 'replace', path: '/dataSchema/properties/idBandOn/title', value: 'ID Band Verified' },
      { op: 'add', path: '/uiSchema/layout/elements/1/options/omf/hideSectionTotal', value: true },
      { op: 'remove', path: '/dataSchema/properties/odd~1key~0name' },
    ]) as ReturnType<typeof doc>;

    expect(result.dataSchema.properties.idBandOn.title).toBe('ID Band Verified');
    expect(
      (result.uiSchema.layout.elements[1] as { options: { omf: Record<string, unknown> } }).options
        .omf.hideSectionTotal,
    ).toBe(true);
    expect(result.dataSchema.properties).not.toHaveProperty('odd/key~name');
  });

  it('never mutates the input document, even mid-failure', () => {
    const original = doc();
    const snapshot = JSON.stringify(original);

    applyJsonPatch(original, [
      { op: 'replace', path: '/dataSchema/properties/idBandOn/title', value: 'X' },
    ]);
    expect(JSON.stringify(original)).toBe(snapshot);

    // Second op fails after the first applied — the input must still be pristine.
    expect(() =>
      applyJsonPatch(original, [
        { op: 'replace', path: '/dataSchema/properties/idBandOn/title', value: 'X' },
        { op: 'remove', path: '/nope' },
      ]),
    ).toThrow(JsonPatchError);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('handles array insert, append with "-", move, and copy', () => {
    const result = applyJsonPatch(doc(), [
      { op: 'add', path: '/uiSchema/layout/elements/1', value: { type: 'Label', text: 'Mid' } },
      { op: 'add', path: '/uiSchema/layout/elements/-', value: { type: 'Label', text: 'End' } },
      { op: 'move', from: '/uiSchema/layout/elements/0', path: '/uiSchema/layout/elements/1' },
      { op: 'copy', from: '/dataSchema/properties/idBandOn', path: '/dataSchema/properties/copy' },
    ]) as ReturnType<typeof doc> & { dataSchema: { properties: Record<string, unknown> } };

    const kinds = (result.uiSchema.layout.elements as Array<{ type: string }>).map((e) => e.type);
    expect(kinds).toEqual(['Label', 'Control', 'Group', 'Label']);
    expect(result.dataSchema.properties.copy).toEqual({ type: 'string', title: 'ID Band On' });
  });

  it('refuses everything that does not apply exactly', () => {
    const cases: Array<Parameters<typeof applyJsonPatch>[1]> = [
      [{ op: 'replace', path: '/dataSchema/properties/missing/title', value: 'x' }],
      [{ op: 'replace', path: '/dataSchema/properties/notThere', value: 'x' }],
      [{ op: 'remove', path: '/uiSchema/layout/elements/9' }],
      [{ op: 'add', path: '/uiSchema/layout/elements/9', value: {} }],
      [{ op: 'replace', path: '/uiSchema/layout/elements/-', value: {} }],
      [{ op: 'add', path: 'no-leading-slash', value: 1 }],
      [{ op: 'test' as never, path: '/dataSchema', value: 1 }],
      [{ op: 'move', path: '/a' } as never],
      [],
    ];
    for (const operations of cases) {
      expect(() => applyJsonPatch(doc(), operations), JSON.stringify(operations)).toThrow(
        JsonPatchError,
      );
    }
  });

  it('names the failing operation index for the fallback log line', () => {
    try {
      applyJsonPatch(doc(), [
        { op: 'replace', path: '/dataSchema/properties/idBandOn/title', value: 'ok' },
        { op: 'remove', path: '/definitely/not/here' },
      ]);
      expect.unreachable();
    } catch (err) {
      expect((err as JsonPatchError).opIndex).toBe(1);
      expect(String(err)).toContain('/definitely/not/here');
    }
  });
});
