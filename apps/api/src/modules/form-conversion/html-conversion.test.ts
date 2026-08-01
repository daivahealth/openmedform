import { describe, it, expect, vi } from 'vitest';
import { FormConversionController } from './form-conversion.controller';
import {
  FormConversionService,
  assertConversionOutputComplete,
  assertHtmlWithinBudget,
} from './form-conversion.service';
import { extractFormHtml } from '../../common/utils/html-extract';
import type { RequestUser } from '../../common/types/jwt-payload.interface';

const user: RequestUser = {
  userId: '10000000-0000-0000-0000-000000000001',
  tenantId: '20000000-0000-0000-0000-000000000002',
  email: 'user@example.com',
  role: 'FORM_DESIGNER',
};

function setup() {
  const service = { startConversion: vi.fn().mockResolvedValue({ id: 'job-1' }) };
  const controller = new FormConversionController(
    service as unknown as FormConversionService,
  );
  return { controller, service };
}

const htmlFile = (sizeBytes: number) =>
  ({
    mimetype: 'text/html',
    size: sizeBytes,
    buffer: Buffer.from('<form><input type="checkbox"></form>'),
    originalname: 'mockup.html',
  }) as Express.Multer.File;

describe('HTML upload guards', () => {
  it('accepts a reasonable HTML mock-up', async () => {
    const { controller, service } = setup();

    await controller.start(user, htmlFile(50_000), '127.0.0.1');

    expect(service.startConversion).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      expect.objectContaining({ mimeType: 'text/html' }),
      '127.0.0.1',
    );
  });

  // The guards run before any async work, so these throw synchronously rather
  // than returning a rejected promise.

  it('rejects an HTML file over the 2MB cap with its actual size', () => {
    const { controller, service } = setup();

    expect(() =>
      controller.start(user, htmlFile(5 * 1024 * 1024), '127.0.0.1'),
    ).toThrow(/limited to 2MB .*5\.0MB/i);
    expect(service.startConversion).not.toHaveBeenCalled();
  });

  it('leaves the larger cap in place for PDFs', async () => {
    const { controller, service } = setup();
    const pdf = {
      mimetype: 'application/pdf',
      size: 5 * 1024 * 1024,
      buffer: Buffer.from('%PDF'),
      originalname: 'form.pdf',
    } as Express.Multer.File;

    await controller.start(user, pdf, '127.0.0.1');

    expect(service.startConversion).toHaveBeenCalled();
  });
});

describe('assertConversionOutputComplete', () => {
  it('accepts a complete JSON object', () => {
    expect(() => assertConversionOutputComplete('{"dataSchema":{}}')).not.toThrow();
  });

  it('accepts a complete object wrapped in markdown fences', () => {
    expect(() =>
      assertConversionOutputComplete('```json\n{"dataSchema":{}}\n```'),
    ).not.toThrow();
  });

  it('rejects output that ran out of budget mid-object, naming the real cause', () => {
    // The failure mode when a form is too large: valid-looking JSON that just
    // stops. Without this the author sees "not valid JSON" and hunts their file.
    expect(() =>
      assertConversionOutputComplete('{"dataSchema":{"properties":{"a":{"type":"str'),
    ).toThrow(/too large to convert in one pass/i);
  });

  it('leaves empty output for the assembler to report', () => {
    expect(() => assertConversionOutputComplete('   ')).not.toThrow();
  });

  it('leaves non-JSON output (e.g. a refusal) for the assembler to report', () => {
    expect(() => assertConversionOutputComplete('I cannot help with that')).not.toThrow();
  });

  describe('zero-field diagnosis', () => {
    // The two causes need different advice. Getting this wrong sends the author
    // hunting for a problem that is not in their file. The guard runs inside the
    // background conversion job, so it is exercised directly rather than through
    // the controller.
    const guardFor = (html: string) => () =>
      assertHtmlWithinBudget(extractFormHtml(html).stats);

    it('names JavaScript as the cause when the page ships scripts', () => {
      const jsBuilt = guardFor(
        `<table id="t"><thead><tr><th>Parameter</th></tr></thead><tbody id="b"></tbody></table>
         <script>buildEverything()</script>`,
      );
      expect(jsBuilt).toThrow(/builds its form with JavaScript/i);
      // …and says what to do about it
      expect(jsBuilt).toThrow(/outerHTML/i);
    });

    it('keeps the plain "not a form" message when there are no scripts', () => {
      const notAForm = guardFor('<h1>Policy document</h1><p>No fields here.</p>');
      expect(notAForm).toThrow(/No form fields were found/i);
      expect(notAForm).not.toThrow(/JavaScript/i);
    });

    it('stays quiet for a mock-up that has real fields, scripts or not', () => {
      expect(
        guardFor('<input type="text" name="a"><script>enhance()</script>'),
      ).not.toThrow();
    });
  });
});
