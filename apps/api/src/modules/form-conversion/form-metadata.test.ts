import { describe, expect, it, vi } from 'vitest';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';

import { FormConversionService } from './form-conversion.service';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';
import { StartConversionDto } from './dto/start-conversion.dto';

/**
 * The two ways to create a form must produce the same entity. The file route
 * used to collect nothing but the file, so an uploaded form landed with no
 * category and whatever formType the schema defaulted to — visibly thinner in
 * the forms list than a described one. These pin both halves: the DTO accepts
 * the metadata off a multipart body, and both routes write it to the form row.
 */

/** Exactly the global pipe from main.ts — the whitelist rules are the point. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const META: ArgumentMetadata = {
  type: 'body',
  metatype: StartConversionDto,
  data: undefined,
};

describe('StartConversionDto', () => {
  it('accepts the category and form type the file dialog now sends', async () => {
    const dto = await pipe.transform(
      { category: 'Risk Assessment', formType: 'NON_PATIENT' },
      META,
    );

    expect(dto).toBeInstanceOf(StartConversionDto);
    expect(dto).toMatchObject({ category: 'Risk Assessment', formType: 'NON_PATIENT' });
  });

  it('accepts a body with neither, so an API client that sends only a file still works', async () => {
    const dto = await pipe.transform({ provider: 'claude' }, META);

    expect(dto.category).toBeUndefined();
    expect(dto.formType).toBeUndefined();
  });

  it('trims a custom category, so " Ward round " and "Ward round" are one category', async () => {
    const dto = await pipe.transform({ category: '  Ward round  ' }, META);

    expect(dto.category).toBe('Ward round');
  });

  it('rejects a form type outside the enum rather than silently defaulting it', async () => {
    await expect(pipe.transform({ formType: 'PATIENTS' }, META)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a category longer than the column allows', async () => {
    await expect(pipe.transform({ category: 'x'.repeat(101) }, META)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('still accepts the legacy engine field a cached client sends', async () => {
    // forbidNonWhitelisted turns any undeclared field into a 400, so dropping
    // this from the DTO would break an already-open browser tab's upload.
    await expect(pipe.transform({ engine: 'jsonforms' }, META)).resolves.toBeDefined();
  });

  it('rejects an undeclared field, which is what makes this DTO the contract', async () => {
    await expect(pipe.transform({ formTyp: 'PATIENT' }, META)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

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

function harness() {
  const tx = {
    form: {
      create: vi.fn().mockResolvedValue({ id: 'form-1' }),
      update: vi.fn().mockResolvedValue({ id: 'form-1' }),
    },
    formVersion: { create: vi.fn().mockResolvedValue({ id: 'version-1' }) },
  };
  const prisma = {
    conversionJob: { update: vi.fn().mockResolvedValue({}) },
    conversionWarning: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const provider = { name: 'stub', generate: vi.fn().mockResolvedValue(RAW_OUTPUT) };
  const service = new FormConversionService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    {
      getProvidersForTenant: vi.fn().mockResolvedValue({}),
      getProvider: vi.fn().mockReturnValue(provider),
    } as never,
    {
      meter: vi.fn().mockImplementation((p: unknown) => p),
      attachFormId: vi.fn().mockResolvedValue(undefined),
    } as never,
    new JsonFormsAssemblerService(new SchemaValidationService()),
    { assertFormLimit: vi.fn().mockResolvedValue(undefined) } as never,
  );

  const convert = (meta: { category?: string; formType?: 'PATIENT' | 'NON_PATIENT' }) =>
    (
      service as unknown as {
        run(
          jobId: string,
          tenantId: string,
          userId: string,
          input: Record<string, unknown>,
        ): Promise<void>;
      }
    ).run('job-1', 'tenant-1', 'user-1', {
      fileName: 'vte-risk.html',
      fileBuffer: Buffer.from(HTML_SOURCE, 'utf8'),
      mimeType: 'text/html',
      ...meta,
    });

  /** What the form row was actually created with. */
  const createdForm = () => tx.form.create.mock.calls[0][0].data;

  return { service, convert, createdForm };
}

describe('form metadata on the file route', () => {
  it('persists the category and form type the uploader chose', async () => {
    const { convert, createdForm } = harness();

    await convert({ category: 'Risk Assessment', formType: 'NON_PATIENT' });

    expect(createdForm()).toMatchObject({
      category: 'Risk Assessment',
      formType: 'NON_PATIENT',
    });
  });

  it('leaves both columns untouched when nothing was chosen', async () => {
    const { convert, createdForm } = harness();

    await convert({});

    // Absent rather than null/empty, so the schema default for formType still
    // applies and the category column stays null.
    expect(createdForm()).not.toHaveProperty('category');
    expect(createdForm()).not.toHaveProperty('formType');
  });
});

describe('form metadata on the describe route', () => {
  it('persists the category and form type instead of only prompting with them', async () => {
    const { service, createdForm } = harness();

    await service.createFromPrompt('tenant-1', 'user-1', {
      name: 'Pre-Anaesthesia Checkup',
      prompt: 'a pre-anaesthesia checkup form',
      category: 'Pre-Operative',
      formType: 'NON_PATIENT',
    });

    expect(createdForm()).toMatchObject({
      category: 'Pre-Operative',
      formType: 'NON_PATIENT',
    });
  });
});
