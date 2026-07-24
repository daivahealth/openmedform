/**
 * The render → compare → AI-patch loop, as pure orchestration over injected
 * dependencies (rasterizer + patcher). No browser here; callers wire a real
 * HtmlRasterizer in deployment. This makes the control flow (threshold, max
 * iterations, similarity history) unit-testable with fakes.
 */

import {
  comparePixels,
  type RasterImage,
  type SchemaPatcher,
  type VisualDiffLoopConfig,
  type VisualDiffResult,
} from './compare-images';

export interface VisualDiffLoopParams {
  /** Rasterized source PDF page to match. */
  sourceImage: RasterImage;
  /** Rasterize the current definition's print HTML to an image of matching size. */
  renderDefinition: (definitionJson: string) => Promise<RasterImage>;
  /** Current definition (serialized), patched between iterations. */
  definitionJson: string;
  /** LLM patcher invoked when similarity is below threshold. */
  patch: SchemaPatcher;
  config?: VisualDiffLoopConfig;
}

export async function runVisualDiffLoop(
  params: VisualDiffLoopParams,
): Promise<VisualDiffResult & { definitionJson: string }> {
  const threshold = params.config?.threshold ?? 0.9;
  const maxIterations = params.config?.maxIterations ?? 3;

  let definitionJson = params.definitionJson;
  const history: number[] = [];
  let similarity = 0;

  for (let i = 0; i < maxIterations; i++) {
    const preview = await params.renderDefinition(definitionJson);
    similarity = comparePixels(params.sourceImage.pixels, preview.pixels).similarity;
    history.push(similarity);

    if (similarity >= threshold) {
      return { iterations: i + 1, finalSimilarity: similarity, passed: true, history, definitionJson };
    }
    // Not the last iteration → ask the LLM to patch and try again.
    if (i < maxIterations - 1) {
      definitionJson = await params.patch(definitionJson, similarity);
    }
  }

  return {
    iterations: maxIterations,
    finalSimilarity: similarity,
    passed: similarity >= threshold,
    history,
    definitionJson,
  };
}
