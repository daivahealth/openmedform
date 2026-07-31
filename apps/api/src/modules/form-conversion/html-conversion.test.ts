import { describe, it, expect, vi } from 'vitest';
import { FormConversionController } from './form-conversion.controller';
import { FormConversionService } from './form-conversion.service';
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
  it('accepts a reasonable HTML mock-up for the jsonforms engine', async () => {
    const { controller, service } = setup();

    await controller.start(user, htmlFile(50_000), 'jsonforms', '127.0.0.1');

    expect(service.startConversion).toHaveBeenCalledWith(
      user.tenantId,
      user.userId,
      expect.objectContaining({ mimeType: 'text/html', engineTarget: 'JSONFORMS' }),
      '127.0.0.1',
    );
  });

  // The guards run before any async work, so these throw synchronously rather
  // than returning a rejected promise.
  it('rejects HTML for the Form.io engine, which only handles PDF/images', () => {
    const { controller, service } = setup();

    expect(() => controller.start(user, htmlFile(50_000), 'formio', '127.0.0.1')).toThrow(
      /JSON Forms engine/i,
    );
    expect(service.startConversion).not.toHaveBeenCalled();
  });

  it('rejects an HTML file over the 2MB cap with its actual size', () => {
    const { controller, service } = setup();

    expect(() =>
      controller.start(user, htmlFile(5 * 1024 * 1024), 'jsonforms', '127.0.0.1'),
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

    await controller.start(user, pdf, 'jsonforms', '127.0.0.1');

    expect(service.startConversion).toHaveBeenCalled();
  });
});
