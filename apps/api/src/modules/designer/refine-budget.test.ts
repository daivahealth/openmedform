import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import { DesignerService } from './designer.service';
import { assertConversionOutputComplete } from '../../common/utils/llm-output';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

function setup(rawOutput: string) {
  const version = {
    id: 'v1',
    version: 1,
    publishedAt: null,
    dataSchema: {},
    uiSchema: {},
    printSchema: {},
    translations: {},
    conversionMetadata: {},
  };
  const prisma = {
    form: {
      findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, name: 'F', versions: [version] }),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: { update: vi.fn().mockResolvedValue(version), create: vi.fn() },
  };
  const provider = { name: 'p', generate: vi.fn().mockResolvedValue(rawOutput) };
  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn() } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    { meter: vi.fn().mockReturnValue(provider) } as never,
    { assemble: vi.fn().mockReturnValue({ warnings: [] }) } as never,
  );
  return { svc, provider };
}

const refine = (svc: DesignerService) =>
  svc.refine(TENANT, FORM_ID, 'rename a section', undefined, () => {}, null, USER);

describe('refine token budget', () => {
  it('asks for the same budget conversion gets', async () => {
    // Refine is the more demanding of the two: it must re-emit the ENTIRE
    // definition to change one label. Half a conversion's budget ran out
    // mid-object on a large chart.
    const { svc, provider } = setup('{}');

    await refine(svc);

    expect(provider.generate.mock.calls[0][2].maxTokens).toBe(32768);
  });
});

describe('refine rejects a truncated response', () => {
  it('names the cause instead of saying the output was not valid JSON', async () => {
    // Conversion has always run this check; refine never did, so a model that
    // ran out of room reached the parser as mangled JSON.
    const truncated = '{"dataSchema":{"type":"object","properties":{"a":{"type":"str';
    const { svc } = setup(truncated);

    await expect(refine(svc)).rejects.toBeInstanceOf(BadRequestException);
    await expect(refine(svc)).rejects.toThrow(/ran out of space/i);
  });

  it('does not reach the assembler with a truncated response', async () => {
    const { svc } = setup('{"dataSchema":{"type":"objec');
    await expect(refine(svc)).rejects.toThrow();
  });

  it('lets a complete response through', async () => {
    const { svc } = setup('{"dataSchema":{"type":"object"}}');
    await expect(refine(svc)).resolves.toBeDefined();
  });
});

describe('assertConversionOutputComplete', () => {
  it('passes complete and fenced output', () => {
    expect(() => assertConversionOutputComplete('{"a":1}')).not.toThrow();
    expect(() => assertConversionOutputComplete('```json\n{"a":1}\n```')).not.toThrow();
  });

  it('leaves empty output for the assembler to report', () => {
    expect(() => assertConversionOutputComplete('')).not.toThrow();
  });

  it('throws only when JSON started and never finished', () => {
    expect(() => assertConversionOutputComplete('{"a":')).toThrow(/ran out of space/i);
    // Prose (a refusal, say) is not truncation — that is the assembler's error.
    expect(() => assertConversionOutputComplete('I cannot help with that.')).not.toThrow();
  });
});
