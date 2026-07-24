import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';

const execFileAsync = promisify(execFile);

/**
 * Shared PDF helpers for the AI conversion pipeline. Kept separate from the
 * Form.io-specific AiBuilderService so the jsonforms conversion path reuses the
 * same text extraction + page-image rendering (pdftoppm) without duplicating it.
 */

export interface PdfText {
  text: string;
  pageCount: number;
}

/** Extract embedded text and page count from a PDF buffer. */
export async function extractPdfText(pdfBuffer: Buffer): Promise<PdfText> {
  const pdf = new PDFParse({ data: pdfBuffer });
  try {
    const result = await pdf.getText();
    return { text: result.text ?? '', pageCount: result.total ?? 0 };
  } finally {
    await pdf.destroy();
  }
}

/**
 * Render the first `maxPages` PDF pages to base64 PNGs via `pdftoppm`. Returns
 * an empty array (rather than throwing) if the tool is unavailable, so callers
 * can fall back to text-only conversion.
 */
export async function renderPdfPagesToImages(
  pdfBuffer: Buffer,
  maxPages: number,
): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'openmedform-conv-'));
  const pdfPath = join(dir, 'source.pdf');
  const outputPrefix = join(dir, 'page');
  try {
    await writeFile(pdfPath, pdfBuffer);
    await execFileAsync('pdftoppm', [
      '-png',
      '-r',
      '150',
      '-f',
      '1',
      '-l',
      String(maxPages),
      pdfPath,
      outputPrefix,
    ]);
    const files = (await readdir(dir))
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort();
    const images: string[] = [];
    for (const file of files.slice(0, maxPages)) {
      const image = await readFile(join(dir, file));
      images.push(image.toString('base64'));
    }
    return images;
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
