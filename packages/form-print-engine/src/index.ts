/**
 * @openmedform/form-print-engine
 *
 * Reconstructs an A4 print document (HTML/CSS @page in mm) from a jsonforms
 * FormDefinition and provides the visual-fidelity loop primitives. The HTML→PDF
 * rasterizer (Playwright/Chromium or WeasyPrint) is injected in deployment.
 */

export { renderPrintHtml } from './render-html';
export type { PrintRenderOptions } from './render-html';
export {
  comparePixels,
} from './compare-images';
export type {
  ImageComparison,
  ComparePixelsOptions,
  RasterImage,
  HtmlRasterizer,
  SchemaPatcher,
  VisualDiffLoopConfig,
  VisualDiffResult,
} from './compare-images';
export { runVisualDiffLoop } from './visual-diff-loop';
export type { VisualDiffLoopParams } from './visual-diff-loop';
