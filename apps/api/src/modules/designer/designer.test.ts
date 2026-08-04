import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, Logger } from '@nestjs/common';

import { DesignerController } from './designer.controller';
import { DesignerService } from './designer.service';

const TENANT = '20000000-0000-0000-0000-000000000002';
const FORM_ID = '30000000-0000-0000-0000-000000000003';
const USER = '10000000-0000-0000-0000-000000000001';

const assembled = {
  dataSchema: { type: 'object', properties: {} },
  uiSchema: { layout: { type: 'VerticalLayout', elements: [] } },
  printSchema: {},
  translations: {},
  conversionMetadata: {},
  scoringRules: {},
  warnings: [],
};

function service(latest: { publishedAt: Date | null }) {
  const version = { id: 'v1', version: 1, ...latest, ...assembled };
  const prisma = {
    form: {
      findFirst: vi.fn().mockResolvedValue({ id: FORM_ID, name: 'F', versions: [version] }),
      update: vi.fn().mockResolvedValue({}),
    },
    formVersion: {
      create: vi.fn().mockResolvedValue({ id: 'v2', version: 2 }),
      update: vi.fn().mockResolvedValue({ id: 'v1', version: 1 }),
    },
  };
  const provider = { name: 'p', generate: vi.fn().mockResolvedValue('{}') };
  // (prisma, audit, providerRegistry, aiUsage, assembler)
  const svc = new DesignerService(
    prisma as never,
    { record: vi.fn() } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    { meter: vi.fn().mockReturnValue(provider) } as never,
    { assemble: vi.fn().mockReturnValue(assembled) } as never,
  );
  return { svc, prisma };
}

/**
 * `engine` was dropped from FormVersion with the Form.io removal (ADR-004), but
 * the refine path kept passing it — so Prisma rejected EVERY refine with
 * "Unknown argument `engine`". Nothing caught it because nothing asserted what
 * this write actually sends.
 */
describe('refine writes only fields FormVersion still has', () => {
  it('forks a new version for a published form without an engine field', async () => {
    const { svc, prisma } = service({ publishedAt: new Date() });

    await svc.refine(TENANT, FORM_ID, 'do a thing', undefined, () => {}, null, USER);

    const data = prisma.formVersion.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('engine');
    expect(data.version).toBe(2);
    expect(data).toHaveProperty('dataSchema');
  });

  it('edits a draft in place without an engine field', async () => {
    const { svc, prisma } = service({ publishedAt: null });

    await svc.refine(TENANT, FORM_ID, 'do a thing', undefined, () => {}, null, USER);

    expect(prisma.formVersion.create).not.toHaveBeenCalled();
    expect(prisma.formVersion.update.mock.calls[0][0].data).not.toHaveProperty('engine');
  });
});

describe('refine error reporting', () => {
  const run = async (thrown: unknown) => {
    const sent: string[] = [];
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => sent.push(chunk)),
      end: vi.fn(),
    };
    const controller = new DesignerController({
      refine: vi.fn().mockRejectedValue(thrown),
      recordFailure: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesignerService);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await controller.refine(
      { userId: USER, tenantId: TENANT, email: 'e', role: 'FORM_DESIGNER' },
      FORM_ID,
      { instruction: 'x' },
      undefined,
      '127.0.0.1',
      res as never,
    );
    const event = sent.find((c) => c.includes('"type":"error"'))!;
    return JSON.parse(event.replace(/^data: /, '').trim()) as { message: string };
  };

  it('passes a BadRequestException message through — those are written for the user', async () => {
    const event = await run(new BadRequestException('The AI ran out of space before finishing.'));
    expect(event.message).toBe('The AI ran out of space before finishing.');
  });

  it('never streams an internal error message to the browser', async () => {
    // A Prisma validation error pretty-prints the whole failing query: ~114 KB
    // of the form's own schema, absolute server paths and source line numbers.
    // That used to go straight to the client.
    const prismaish = new Error(
      'Invalid `this.prisma.formVersion.create()` invocation in\n' +
        '/Users/someone/openmedform/apps/api/src/modules/designer/designer.service.ts:131:39\n' +
        'dataSchema: { type: "object", properties: { secret: { enum: ["A","B"] } } }\n' +
        'Unknown argument `engine`.',
    );

    const event = await run(prismaish);

    expect(event.message).not.toContain('prisma');
    expect(event.message).not.toContain('/Users/');
    expect(event.message).not.toContain('dataSchema');
    expect(event.message).not.toContain('designer.service.ts');
    expect(event.message).toMatch(/problem on the server/i);
    // Still tells the user the state of their form, which is what they need.
    expect(event.message).toMatch(/Nothing was changed/i);
    expect(event.message.length).toBeLessThan(300);
  });
});
