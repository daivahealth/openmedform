import { describe, it, expect } from 'vitest';
import { comparePixels, type RasterImage } from './compare-images';
import { runVisualDiffLoop } from './visual-diff-loop';

function solid(rgba: [number, number, number, number], pixels: number): Uint8Array {
  const buf = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i++) buf.set(rgba, i * 4);
  return buf;
}

describe('comparePixels', () => {
  it('is 1.0 for identical buffers', () => {
    const a = solid([10, 20, 30, 255], 100);
    expect(comparePixels(a, a).similarity).toBe(1);
  });

  it('is 0.0 when every pixel differs beyond tolerance', () => {
    const a = solid([0, 0, 0, 255], 100);
    const b = solid([255, 255, 255, 255], 100);
    const r = comparePixels(a, b);
    expect(r.similarity).toBe(0);
    expect(r.diffPixels).toBe(100);
  });

  it('reports partial similarity', () => {
    const a = solid([0, 0, 0, 255], 100);
    const b = solid([0, 0, 0, 255], 100);
    for (let i = 0; i < 25; i++) b[i * 4] = 255; // 25% differ
    expect(comparePixels(a, b).similarity).toBeCloseTo(0.75, 5);
  });

  it('throws on size mismatch', () => {
    expect(() => comparePixels(solid([0, 0, 0, 0], 4), solid([0, 0, 0, 0], 8))).toThrow(/differ in size/);
  });
});

describe('runVisualDiffLoop', () => {
  const source: RasterImage = { width: 10, height: 10, pixels: solid([0, 0, 0, 255], 100) };

  it('stops early once the threshold is met', async () => {
    const result = await runVisualDiffLoop({
      sourceImage: source,
      definitionJson: '{}',
      renderDefinition: async () => source, // identical → similarity 1
      patch: async (d) => d,
      config: { threshold: 0.9, maxIterations: 3 },
    });
    expect(result.passed).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.finalSimilarity).toBe(1);
  });

  it('iterates and patches, improving similarity each pass', async () => {
    // preview improves: iter0 all-white (0), iter1 half (0.5), iter2 exact (1)
    const previews = [
      solid([255, 255, 255, 255], 100),
      (() => {
        const b = solid([0, 0, 0, 255], 100);
        for (let i = 0; i < 50; i++) b[i * 4] = 255;
        return b;
      })(),
      solid([0, 0, 0, 255], 100),
    ];
    let call = 0;
    let patches = 0;
    const result = await runVisualDiffLoop({
      sourceImage: source,
      definitionJson: 'v0',
      renderDefinition: async () => ({ width: 10, height: 10, pixels: previews[call++] }),
      patch: async () => `v${++patches}`,
      config: { threshold: 0.99, maxIterations: 3 },
    });
    expect(result.history).toEqual([0, 0.5, 1]);
    expect(result.passed).toBe(true);
    expect(result.definitionJson).toBe('v2');
  });

  it('gives up after maxIterations if never converged', async () => {
    const result = await runVisualDiffLoop({
      sourceImage: source,
      definitionJson: '{}',
      renderDefinition: async () => ({ width: 10, height: 10, pixels: solid([255, 255, 255, 255], 100) }),
      patch: async (d) => d,
      config: { threshold: 0.9, maxIterations: 2 },
    });
    expect(result.passed).toBe(false);
    expect(result.iterations).toBe(2);
  });
});
