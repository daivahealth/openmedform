import { describe, expect, it, vi } from 'vitest';

import { DesignerService } from './designer.service';
import { JsonFormsAssemblerService } from '../form-conversion/jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

/**
 * Diff-based refine (#130): patch mode applies against the REAL assembler so a
 * patched definition is proven to pass the same Ajv/scope/scoring checks a
 * re-emitted one passes, and every failure road leads to the full-mode
 * fallback, never to a half-applied edit.
 */

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

const CURRENT = {
  dataSchema: {
    type: 'object',
    properties: { idBandOn: { type: 'string', title: 'ID Band On' } },
  },
  uiSchema: {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/idBandOn' }],
  },
  printSchema: { pageSize: 'A4' },
  translations: {},
  conversionMetadata: { fields: [] },
};

const PATCH_RESPONSE = JSON.stringify({
  mode: 'patch',
  changeSummary: "Renamed 'ID Band On' to 'ID Band Verified'.",
  operations: [
    { op: 'replace', path: '/dataSchema/properties/idBandOn/title', value: 'ID Band Verified' },
  ],
});

const FULL_RESPONSE = JSON.stringify({
  ...CURRENT,
  changeSummary: 'Rewrote the whole thing.',
});

function harness(responses: string[]) {
  const version = { id: 'v1', version: 1, publishedAt: null, ...CURRENT };
  const chatRows: Array<Record<string, unknown>> = [];
  const versionWrites: Array<Record<string, unknown>> = [];

  const prisma = {
    form: {
      findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, name: 'F', versions: [version] }),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: {
      create: vi.fn().mockResolvedValue({ id: 'v2', version: 2 }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        versionWrites.push(data);
        return Promise.resolve({ id: 'v1', version: 1 });
      }),
    },
    formAiMessage: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        chatRows.push(data);
        return Promise.resolve({ id: 'm' });
      }),
    },
  };
  const generate = vi.fn();
  for (const r of responses) generate.mockResolvedValueOnce(r);
  const provider = { name: 'p', generate };

  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn() } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    { meter: vi.fn().mockReturnValue(provider) } as never,
    new JsonFormsAssemblerService(new SchemaValidationService()),
  );
  return { svc, generate, versionWrites, chatRows };
}

describe('diff-based refine', () => {
  it('applies a patch response in ONE model call and saves the patched artifacts', async () => {
    const { svc, generate, versionWrites, chatRows } = harness([PATCH_RESPONSE]);

    const result = await svc.refine(TENANT, FORM_ID, 'rename it', undefined, () => {}, null, USER);

    expect(generate).toHaveBeenCalledTimes(1);
    const saved = versionWrites[0].dataSchema as {
      properties: { idBandOn: { title: string } };
    };
    expect(saved.properties.idBandOn.title).toBe('ID Band Verified');
    // The patched result went through the real assembler: scoring re-derived,
    // ui schema normalized, warnings extracted.
    expect(versionWrites[0]).toHaveProperty('scoringRules');
    // The model's own summary leads the chat reply.
    expect(chatRows[1].content).toContain("Renamed 'ID Band On' to 'ID Band Verified'.");
    expect(result.version).toBe(1);
  });

  it('falls back to a full re-emit when the patch misses its target', async () => {
    const badPatch = JSON.stringify({
      mode: 'patch',
      operations: [{ op: 'replace', path: '/dataSchema/properties/nope/title', value: 'x' }],
    });
    const { svc, generate, versionWrites } = harness([badPatch, FULL_RESPONSE]);

    const progressLines: string[] = [];
    await svc.refine(TENANT, FORM_ID, 'rename it', undefined, (m) => progressLines.push(m), null, USER);

    expect(generate).toHaveBeenCalledTimes(2);
    // The retry demanded full mode.
    expect(String(generate.mock.calls[1][0])).toContain('Respond in FULL mode only');
    // The user saw the slow-path note, not an error.
    expect(progressLines.join(' ')).toContain('redoing it as a full rewrite');
    // And the full response is what got saved.
    expect(versionWrites).toHaveLength(1);
  });

  it('falls back when the patch applies but produces an invalid definition', async () => {
    // Structurally valid patch, semantically fatal: it deletes the dataSchema
    // properties the assembler requires. Apply succeeds; assemble throws.
    const fatalPatch = JSON.stringify({
      mode: 'patch',
      operations: [{ op: 'replace', path: '/dataSchema', value: {} }],
    });
    const { svc, generate } = harness([fatalPatch, FULL_RESPONSE]);

    await svc.refine(TENANT, FORM_ID, 'x', undefined, () => {}, null, USER);

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('treats a full-mode response exactly as before — one call, no patching', async () => {
    const { svc, generate, versionWrites, chatRows } = harness([FULL_RESPONSE]);

    await svc.refine(TENANT, FORM_ID, 'restructure everything', undefined, () => {}, null, USER);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(versionWrites).toHaveLength(1);
    expect(chatRows[1].content).toContain('Rewrote the whole thing.');
  });

  it('still reports truncation with the specific out-of-space message', async () => {
    const truncated = FULL_RESPONSE.slice(0, FULL_RESPONSE.length - 20);
    const { svc } = harness([truncated]);

    await expect(
      svc.refine(TENANT, FORM_ID, 'x', undefined, () => {}, null, USER),
    ).rejects.toThrow(/ran out of space/);
  });
});
