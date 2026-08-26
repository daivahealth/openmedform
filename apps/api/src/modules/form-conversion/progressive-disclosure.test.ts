import { describe, expect, it, vi } from 'vitest';

import { FormConversionService } from './form-conversion.service';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

/**
 * Progressive disclosure end to end.
 *
 * The CAM-ICU worksheet ships Features 2-4 as `display:none` table rows its
 * script reveals in turn. Hidden markup is stripped by default, so a
 * four-feature delirium assessment converted to a one-question form: the rows
 * never reached the model at all. These run the real `run()` path and assert on
 * the prompt the provider was actually handed — that the sections survived the
 * strip, and that the model is told to gate them with a rule rather than to ask
 * every question at once.
 */

const RAW_OUTPUT = JSON.stringify({
  name: 'CAM-ICU',
  dataSchema: {
    type: 'object',
    properties: { feature1: { type: 'string', title: 'Feature 1' } },
  },
  uiSchema: {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/feature1' }],
  },
  printSchema: { pageSize: 'A4' },
  translations: {},
  conversionMetadata: { fields: [] },
});

/** The worksheet's shape, reduced to the part that matters. */
const HTML_SOURCE = `
<table><tbody>
  <tr>
    <td><strong>Feature 1: Acute Onset or Fluctuating Course</strong></td>
    <td><select class="cam-feat"><option value="">Select…</option><option value="present">Present</option><option value="absent">Absent</option></select></td>
  </tr>
  <tr id="cam-row-2" style="display:none">
    <td><strong>Feature 2: Inattention — Letters Attention Test</strong></td>
    <td><select class="cam-feat"><option value="absent">0–2 errors</option><option value="present">&gt;2 errors</option></select></td>
  </tr>
</tbody></table>
<div>CAM-ICU is POSITIVE only if Feature 1 is present AND Feature 2 is present.</div>
<div id="cam-result">Overall result: select all four features to calculate</div>
<script>
  const row2 = document.getElementById('cam-row-2');
  const banner = document.getElementById('cam-result');
  function calcCam(){
    row2.style.display = '';
    banner.textContent = 'Overall result: CAM-ICU POSITIVE (Delirium Present)';
  }
  document.querySelectorAll('.cam-feat').forEach(s => s.addEventListener('change', calcCam));
</script>`;

function harness() {
  const tx = {
    form: {
      create: vi.fn().mockResolvedValue({ id: 'form-1' }),
      update: vi.fn().mockResolvedValue({ id: 'form-1' }),
    },
    formVersion: { create: vi.fn().mockResolvedValue({ id: 'version-1' }) },
  };
  const warningRows: Array<{ message: string }> = [];
  const prisma = {
    conversionJob: { update: vi.fn().mockResolvedValue({}) },
    conversionWarning: {
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<{ message: string }> }) => {
        warningRows.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
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

  const run = () =>
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
      fileName: 'cam-icu.html',
      fileBuffer: Buffer.from(HTML_SOURCE, 'utf8'),
      mimeType: 'text/html',
    });

  /** The user prompt the provider was handed. */
  const prompt = () => provider.generate.mock.calls[0][0] as string;

  return { run, prompt, warningRows };
}

describe('script-revealed sections reach the model', () => {
  it('keeps the hidden row in the source handed to the provider', async () => {
    const { run, prompt } = harness();

    await run();

    expect(prompt()).toContain('Feature 2: Inattention');
    // Present AND marked invisible would read as "ignore this".
    expect(prompt()).not.toMatch(/display\s*:\s*none/);
  });

  it('tells the model to gate them with a rule on the row', async () => {
    const { run, prompt } = harness();

    await run();

    const text = prompt();
    expect(text).toContain('PROGRESSIVE DISCLOSURE');
    expect(text).toContain('"effect": "SHOW"');
    expect(text).toContain('the rule goes on the "OmfTableRow" itself');
    // The scripts are never run, so the trigger comes from the form's own text.
    expect(text).toContain("read the trigger from the form's OWN instructions");
  });

  it('records a reviewer warning naming what was revealed', async () => {
    const { run, warningRows } = harness();

    await run();

    const messages = warningRows.map((w) => w.message).join(' ');
    expect(messages).toMatch(/hidden until this mock-up's script reveals them/);
    expect(messages).toContain('#cam-row-2');
  });
});

describe('script-computed result text', () => {
  it('tells the model the banner is a placeholder, not a label', async () => {
    const { run, prompt } = harness();

    await run();

    const text = prompt();
    expect(text).toContain('COMPUTED RESULT');
    expect(text).toContain('"Overall result: select all four features to calculate"');
    expect(text).toContain('Do NOT emit that text as a "Label"');
  });

  it('points it at the rule the form states in prose, via a root-scope condition', async () => {
    const { run, prompt } = harness();

    await run();

    const text = prompt();
    expect(text).toContain('"scope": "#"');
    expect(text).toContain('which matches the WHOLE response');
    // The rule sentence the model has to read is in the source it was handed.
    expect(text).toContain('CAM-ICU is POSITIVE only if Feature 1 is present');
  });

  it('asks for a warning, because the outcome wording is the converter\'s', async () => {
    const { run, prompt, warningRows } = harness();

    await run();

    expect(prompt()).toContain('add an UNCLEAR_LABEL warning');
    const messages = warningRows.map((w) => w.message).join(' ');
    expect(messages).toMatch(/text COMPUTED by this mock-up's script/);
    expect(messages).toContain('#cam-result');
  });
});
