import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { extractFormHtml } from './html-extract';
import { detectLayoutStructures, type LayoutSnapshot } from './layout-detect';

/**
 * The geometry snapshots are captured from real Chromium runs of the sibling
 * `.html` fixtures (see the "regenerating" note below) and committed, because
 * CI has no browser and jsdom has no layout engine — `getBoundingClientRect()`
 * returns zeroes there, so a live capture would test nothing.
 *
 * That split is deliberate: the capture step in html-render.ts is dumb enough
 * to verify by eye once, while the clustering in layout-detect.ts is the part
 * with judgement in it, and these tests exercise it against genuine browser
 * geometry rather than numbers invented to make it pass.
 *
 * To regenerate after changing a fixture or the capture:
 *   CHROMIUM_PATH=<browser> npx tsx -e "…renderHtmlToDomWithOutcome(html)…"
 * and write `outcome.layout` to the matching `.layout.json`.
 */
const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const snapshot = (name: string): LayoutSnapshot =>
  JSON.parse(fixture(`${name}.layout.json`)) as LayoutSnapshot;

describe('detectLayoutStructures', () => {
  it('finds a transposed matrix in a grid built from divs, with no table markup', () => {
    const html = fixture('vip-div-grid.html');
    // Guard the premise: if this fixture ever grows a <table>, the markup
    // detectors would find it and this test would stop proving anything.
    expect(extractFormHtml(html).transposedMatrices).toEqual([]);

    const { transposedMatrices, repeatingTables } = detectLayoutStructures(
      snapshot('vip-div-grid'),
    );

    expect(repeatingTables).toEqual([]);
    expect(transposedMatrices).toHaveLength(1);
    expect(transposedMatrices[0].labelHeader).toBe('Parameter');
    expect(transposedMatrices[0].instanceHeaders).toEqual(['Cannula 1']);
    expect(transposedMatrices[0].addInstanceLabel).toBe('+ Add Cannula');
    expect(transposedMatrices[0].addNestedLabel).toBe('+ Day');
    expect(transposedMatrices[0].rowLabels).toHaveLength(22);
    expect(transposedMatrices[0].rowLabels[0]).toBe('Date of Insertion');
    expect(transposedMatrices[0].rowLabels.at(-1)).toBe('Nurse Team Lead — EC Code');
  });

  it('recovers the same hint from geometry that the markup path finds in the real table', () => {
    // The point of the whole module: how the grid was drawn must not change
    // what we detect. Same chart, one as <table> and one as CSS grid, must
    // produce byte-identical hints.
    const fromMarkup = extractFormHtml(fixture('vip-rendered.html')).transposedMatrices;
    expect(fromMarkup).toHaveLength(1);

    const fromGeometry = detectLayoutStructures(snapshot('vip-div-grid')).transposedMatrices;
    expect(fromGeometry).toEqual(fromMarkup);
  });

  it('agrees with the markup path on the table fixture itself', () => {
    const fromMarkup = extractFormHtml(fixture('vip-rendered.html')).transposedMatrices;
    const fromGeometry = detectLayoutStructures(snapshot('vip-rendered')).transposedMatrices;
    expect(fromGeometry).toEqual(fromMarkup);
  });

  it('leaves a static grid with no add affordance alone', () => {
    // Same two-column label/control shape as the matrix fixture. The only
    // difference is that nothing adds a record, so it is a details panel and
    // must stay a plain set of fields rather than becoming a recordTable.
    expect(detectLayoutStructures(snapshot('plain-div-grid'))).toEqual({
      repeatingTables: [],
      transposedMatrices: [],
    });
  });

  it('returns nothing for an empty snapshot', () => {
    expect(detectLayoutStructures({ nodes: [] })).toEqual({
      repeatingTables: [],
      transposedMatrices: [],
    });
  });

  it('reads records-as-rows as a repeating log rather than a matrix', () => {
    // Synthetic, because the discriminator is the thing under test: the left
    // column holds CONTROLS, so each row is a record and the shape is a log.
    const row = (y: number, kind: 'label' | 'control') =>
      [0, 140, 280].map((x) => ({ kind, text: '', x, y, width: 120, height: 24 }));

    const nodes = [
      { kind: 'label' as const, text: '3 sessions logged', x: 0, y: 0, width: 200, height: 20 },
      ...['Date', 'Score', 'Signed By'].map((text, i) => ({
        kind: 'label' as const,
        text,
        x: i * 140,
        y: 40,
        width: 120,
        height: 24,
      })),
      ...row(80, 'control'),
      ...row(120, 'control'),
      { kind: 'button' as const, text: '+ Add Session', x: 0, y: 170, width: 140, height: 32 },
    ];

    const { repeatingTables, transposedMatrices } = detectLayoutStructures({ nodes });

    expect(transposedMatrices).toEqual([]);
    expect(repeatingTables).toEqual([
      {
        columns: ['Date', 'Score', 'Signed By'],
        addLabel: '+ Add Session',
        countLabel: '3 sessions logged',
      },
    ]);
  });
});
