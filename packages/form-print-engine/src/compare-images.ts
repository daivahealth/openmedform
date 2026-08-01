/**
 * Visual-fidelity primitives for the render → compare → AI-patch loop.
 *
 * `comparePixels` is the pure, testable core: given two equal-size RGBA buffers
 * it returns a 0..1 similarity. The surrounding loop (rasterize the print HTML
 * with a headless browser, diff against the source page image, ask the LLM to
 * patch the schema, repeat until the threshold or max retries) is defined here
 * as interfaces; the rasterizer + PNG decoder are injected in deployment
 * (the rasterizer is injected, not bundled — see docs/ADR/003-json-forms-platform.md).
 */

export interface ImageComparison {
  /** 1 = identical, 0 = every pixel differs. */
  similarity: number;
  diffPixels: number;
  totalPixels: number;
}

export interface ComparePixelsOptions {
  /** Per-channel tolerance 0..1 before a pixel counts as different (default 0.05). */
  tolerance?: number;
}

/**
 * Compare two RGBA pixel buffers of equal length. A pixel differs if any channel
 * differs by more than `tolerance` of full scale.
 */
export function comparePixels(
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
  options: ComparePixelsOptions = {},
): ImageComparison {
  if (a.length !== b.length) {
    throw new Error(`Image buffers differ in size (${a.length} vs ${b.length}); resize before comparing`);
  }
  const tol = Math.round((options.tolerance ?? 0.05) * 255);
  const totalPixels = Math.floor(a.length / 4);
  let diffPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > tol ||
      Math.abs(a[i + 1] - b[i + 1]) > tol ||
      Math.abs(a[i + 2] - b[i + 2]) > tol ||
      Math.abs(a[i + 3] - b[i + 3]) > tol
    ) {
      diffPixels++;
    }
  }
  return {
    similarity: totalPixels === 0 ? 1 : 1 - diffPixels / totalPixels,
    diffPixels,
    totalPixels,
  };
}

// --- Visual-diff loop contract (rasterizer injected in deployment) ----------

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA pixels, length = width * height * 4. */
  pixels: Uint8Array | Uint8ClampedArray;
}

/** Rasterizes print HTML to an image (Playwright/Chromium or WeasyPrint). */
export type HtmlRasterizer = (html: string, widthPx: number) => Promise<RasterImage>;

/** Asks the LLM to patch the definition given source vs preview mismatch. */
export type SchemaPatcher = (
  currentDefinitionJson: string,
  similarity: number,
) => Promise<string>;

export interface VisualDiffLoopConfig {
  /** Stop once similarity ≥ this (default 0.9 — "as accurate as possible", not pixel-perfect). */
  threshold?: number;
  /** Max render→patch iterations (default 3). */
  maxIterations?: number;
}

export interface VisualDiffResult {
  iterations: number;
  finalSimilarity: number;
  passed: boolean;
  history: number[];
}
