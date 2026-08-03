import { describe, expect, it, vi } from 'vitest';

import { FormConversionService } from './form-conversion.service';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

/**
 * The conversion dialog draws a live checklist from conversion_job.stage, so
 * the pipeline must actually record its stages, in pipeline order, and must
 * not leave a stale stage on the finished row. These run the real `run()` path
 * over a static HTML source with everything external stubbed.
 */

/** Minimal-but-valid model output: enough for the assembler's Ajv check. */
const RAW_OUTPUT = JSON.stringify({
  name: 'Test form',
  dataSchema: {
    type: 'object',
    properties: { patientName: { type: 'string', title: 'Patient name' } },
  },
  uiSchema: {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/patientName' }],
  },
  printSchema: { pageSize: 'A4' },
  translations: {},
  conversionMetadata: { fields: [] },
});

const HTML_SOURCE = [
  '<form>',
  '  <label for="patientName">Patient name</label>',
  '  <input id="patientName" type="text" name="patientName">',
  '</form>',
].join('\n');

function harness(options?: { failStageWrite?: string }) {
  /** Every conversionJob.update payload, in call order. */
  const jobUpdates: Array<Record<string, unknown>> = [];

  const tx = {
    form: {
      create: vi.fn().mockResolvedValue({ id: 'form-1' }),
      update: vi.fn().mockResolvedValue({ id: 'form-1' }),
    },
    formVersion: { create: vi.fn().mockResolvedValue({ id: 'version-1' }) },
  };
  const prisma = {
    conversionJob: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        if (options?.failStageWrite && data.stage === options.failStageWrite) {
          return Promise.reject(new Error('db hiccup'));
        }
        jobUpdates.push(data);
        return Promise.resolve({});
      }),
    },
    conversionWarning: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };

  const provider = {
    name: 'stub',
    generate: vi.fn().mockResolvedValue(RAW_OUTPUT),
  };
  const providerRegistry = {
    getProvidersForTenant: vi.fn().mockResolvedValue({}),
    getProvider: vi.fn().mockReturnValue(provider),
  };
  const aiUsage = {
    meter: vi.fn().mockImplementation((p: unknown) => p),
    attachFormId: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new FormConversionService(
    prisma as never,
    audit as never,
    providerRegistry as never,
    aiUsage as never,
    new JsonFormsAssemblerService(new SchemaValidationService()),
    {} as never,
  );

  const run = () =>
    (
      service as unknown as {
        run(
          jobId: string,
          tenantId: string,
          userId: string,
          input: {
            fileName: string;
            fileBuffer: Buffer;
            mimeType: string;
          },
        ): Promise<void>;
      }
    ).run('job-1', 'tenant-1', 'user-1', {
      fileName: 'test.html',
      fileBuffer: Buffer.from(HTML_SOURCE, 'utf8'),
      mimeType: 'text/html',
    });

  return { run, jobUpdates, provider };
}

describe('conversion stage reporting', () => {
  it('records the stages in pipeline order', async () => {
    const { run, jobUpdates } = harness();

    await run();

    const stages = jobUpdates.filter((u) => 'stage' in u).map((u) => u.stage);
    expect(stages).toEqual(['READING_SOURCE', 'GENERATING', 'VALIDATING', 'SAVING', null]);
  });

  it('says what is being generated from', async () => {
    const { run, jobUpdates } = harness();

    await run();

    const generating = jobUpdates.find((u) => u.stage === 'GENERATING');
    expect(generating?.stageDetail).toBe('HTML mock-up · stub');
  });

  it('clears the stage on the finished row so nothing stale survives', async () => {
    const { run, jobUpdates } = harness();

    await run();

    const done = jobUpdates.find((u) => u.status === 'REVIEW');
    expect(done).toMatchObject({ stage: null, stageDetail: null });
  });

  it('a failed stage write does not fail the conversion', async () => {
    const { run, jobUpdates } = harness({ failStageWrite: 'GENERATING' });

    await run();

    // The progress write was lost, the conversion was not.
    const reviewed = jobUpdates.find((u) => u.status === 'REVIEW');
    expect(reviewed).toBeTruthy();
    expect(jobUpdates.some((u) => u.status === 'FAILED')).toBe(false);
  });

});
