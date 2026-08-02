import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { extractFormHtml } from './html-extract';
import {
  detectLayoutStructures,
  rowsGainedBetween,
  type LayoutSnapshot,
} from './layout-detect';

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


/**
 * Measuring a repeating-group split by interaction, from real browser geometry
 * captured either side of a "+ Day" click (see the regeneration note above).
 */
describe('rowsGainedBetween', () => {
  const probe = JSON.parse(fixture('vip-interactive.probe.json')) as {
    clicks: { label: string; before: LayoutSnapshot; after: LayoutSnapshot }[];
  };
  const clickNamed = (label: string) => probe.clicks.find((c) => c.label === label)!;

  const CANNULA_ROWS = [
    'Date of Insertion',
    'Time of Insertion',
    'Inserted At',
    'Inserted By — Name',
    'Inserted By — EC Code',
    'Site',
    'Side',
    'Size of Cannula (Gauge)',
  ];

  it('names exactly the rows that grew when "+ Day" was pressed', () => {
    const gained = rowsGainedBetween(clickNamed('+ Day').before, clickNamed('+ Day').after);

    // 22 rows in the chart; the 14 day-level ones gained a cell.
    expect(gained).toHaveLength(14);
    expect(gained[0]).toBe('Day & Date');
    expect(gained.at(-1)).toBe('Nurse Team Lead — EC Code');
    // The point of measuring: the per-cannula rows must NOT be in there.
    for (const row of CANNULA_ROWS) expect(gained).not.toContain(row);
  });

  it('reports nothing for a control that changed nothing', () => {
    // The fixture's "+ Add Cannula" handler is a no-op, so a click that does
    // nothing must measure as nothing rather than as "everything".
    const click = clickNamed('+ Add Cannula');
    expect(rowsGainedBetween(click.before, click.after)).toEqual([]);
  });

  it('is empty when the snapshots are identical', () => {
    const snap = clickNamed('+ Day').after;
    expect(rowsGainedBetween(snap, snap)).toEqual([]);
  });

  it('ignores a row that lost controls', () => {
    const before: LayoutSnapshot = {
      nodes: [
        { kind: 'label', text: 'Shrinks', x: 0, y: 0, width: 100, height: 20 },
        { kind: 'control', text: '', x: 120, y: 0, width: 80, height: 20 },
        { kind: 'control', text: '', x: 210, y: 0, width: 80, height: 20 },
      ],
    };
    const after: LayoutSnapshot = { nodes: before.nodes.slice(0, 2) };

    expect(rowsGainedBetween(before, after)).toEqual([]);
  });

  it('sees a row that only exists after the click', () => {
    const before: LayoutSnapshot = {
      nodes: [{ kind: 'label', text: 'Existing', x: 0, y: 0, width: 100, height: 20 }],
    };
    const after: LayoutSnapshot = {
      nodes: [
        ...before.nodes,
        { kind: 'label', text: 'Brand new', x: 0, y: 40, width: 100, height: 20 },
        { kind: 'control', text: '', x: 120, y: 40, width: 80, height: 20 },
      ],
    };

    expect(rowsGainedBetween(before, after)).toEqual(['Brand new']);
  });
});
