/**
 * Recover repeating form structure from rendered *geometry* rather than markup.
 *
 * WHY THIS EXISTS — the markup detectors in html-extract.ts walk
 * `<table>/<thead>/<tbody>`. A mock-up that draws the same grid with `<div>`s
 * and CSS grid or flexbox is invisible to them, and AI-generated mock-ups
 * increasingly do exactly that. Conversion then runs on the model's unguided
 * judgement, which is the mode that produced dropped fields and invented
 * columns before hints existed.
 *
 * Where a pixel sits does not care how the pixel got there. Clustering the
 * on-screen positions of labels and controls finds the same two shapes —
 * records-as-rows and records-as-columns — for `<table>`, CSS grid, flexbox or
 * absolute positioning alike, and emits the SAME hint types the markup
 * detectors emit, so nothing downstream changes.
 *
 * This module is deliberately pure: it takes a geometry snapshot captured
 * elsewhere (html-render.ts, inside the browser) and returns hints. No DOM, no
 * browser, no I/O — so the clustering can be unit-tested against synthetic
 * layouts without launching Chromium, which CI does not have.
 */

import {
  ADD_BUTTON,
  NESTED_ADD_BUTTON,
  type RepeatingTableHint,
  type TransposedMatrixHint,
} from './html-extract';

/** One positioned thing on the rendered page. */
export interface LayoutNode {
  /** 'label' = static text, 'control' = input/select/textarea, 'button' = clickable. */
  kind: 'label' | 'control' | 'button';
  /** Own text, trimmed. Empty for most controls. */
  text: string;
  /** Document coordinates (scroll-adjusted), CSS pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSnapshot {
  nodes: LayoutNode[];
}

export interface LayoutStructures {
  repeatingTables: RepeatingTableHint[];
  transposedMatrices: TransposedMatrixHint[];
}

/**
 * The add-affordance patterns are imported, not restated: a shape must not be a
 * repeating structure to one detector and a plain grid to the other.
 */
const COUNT_LINE = /^\d+\s+\S.*\b(logged|record|entr|row|item|session)/i;

/**
 * Rows must be at least this tall apart to be different rows. Generous enough
 * to tolerate baseline jitter between a label and the input beside it, tight
 * enough not to merge adjacent form rows.
 */
const ROW_TOLERANCE_PX = 12;
/** Columns whose left edges are within this are the same column. */
const COL_TOLERANCE_PX = 20;

/**
 * Below this many field rows a "matrix" is more likely a heading plus a couple
 * of stray fields. Real parameter matrices are long.
 */
const MIN_MATRIX_ROWS = 3;
/** A log needs a header of at least this many columns to be worth hinting. */
const MIN_LOG_COLUMNS = 2;

/** Group values that sit within `tolerance` of each other, preserving order. */
function cluster<T>(items: T[], value: (t: T) => number, tolerance: number): T[][] {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(value(item) - value(last[last.length - 1])) <= tolerance) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

/** Vertical centre — more stable than `top` when a row mixes text and inputs. */
const centreY = (n: LayoutNode) => n.y + n.height / 2;

/**
 * Strip a trailing nested-add control's text off an instance heading, so
 * "Cannula 1 + Day" reads as "Cannula 1" — mirrors instanceHeaderText() on the
 * markup path.
 */
function splitInstanceHeading(text: string): { heading: string; nested?: string } {
  const match = text.match(/^(.*?)\s*([+➕]\s*\S[^+]*)$/);
  if (!match) return { heading: text.trim() };
  const nested = match[2].trim();
  if (!NESTED_ADD_BUTTON.test(nested)) return { heading: text.trim() };
  return { heading: match[1].trim(), nested };
}

/**
 * Find repeating structures in a rendered layout.
 *
 * Returns hints in exactly the shape the markup detectors produce, so the
 * conversion service can use either source interchangeably.
 */
export function detectLayoutStructures(snapshot: LayoutSnapshot): LayoutStructures {
  const empty: LayoutStructures = { repeatingTables: [], transposedMatrices: [] };

  const nodes = snapshot.nodes.filter((n) => n.width > 0 && n.height > 0);
  if (nodes.length === 0) return empty;

  const addButtons = nodes.filter((n) => n.kind === 'button' && ADD_BUTTON.test(n.text));
  // No way to add another record means it is not a repeating structure — a
  // print-only grid the clinician fills by hand must stay a plain grid.
  if (addButtons.length === 0) return empty;

  const rows = cluster(nodes, centreY, ROW_TOLERANCE_PX);

  // The header is the topmost row of 2+ static labels containing no controls.
  const headerIndex = rows.findIndex(
    (row) =>
      row.filter((n) => n.kind === 'label' && n.text).length >= MIN_LOG_COLUMNS &&
      row.every((n) => n.kind !== 'control'),
  );
  if (headerIndex === -1) return empty;

  const header = [...rows[headerIndex]].sort((a, b) => a.x - b.x);
  const bodyRows = rows.slice(headerIndex + 1).filter((row) => row.some((n) => n.kind !== 'button'));
  if (bodyRows.length === 0) return empty;

  // THE DISCRIMINATOR between the two shapes: what is in the leftmost column
  // below the header? Static labels means the fields run DOWN the side and
  // records run ACROSS (a transposed matrix). Controls means each row is itself
  // a record (a log).
  const leftEdge = Math.min(...header.map((n) => n.x));
  const leftColumn = bodyRows
    .map((row) => [...row].sort((a, b) => a.x - b.x)[0])
    .filter((n): n is LayoutNode => !!n && Math.abs(n.x - leftEdge) <= COL_TOLERANCE_PX);

  const leftIsLabels =
    leftColumn.length >= MIN_MATRIX_ROWS && leftColumn.every((n) => n.kind === 'label' && !!n.text);

  if (leftIsLabels) {
    const matrix = buildTransposedMatrix(header, leftColumn, addButtons);
    return matrix ? { repeatingTables: [], transposedMatrices: [matrix] } : empty;
  }

  const log = buildRepeatingLog(header, bodyRows, nodes, addButtons);
  return log ? { repeatingTables: [log], transposedMatrices: [] } : empty;
}

function buildTransposedMatrix(
  header: LayoutNode[],
  leftColumn: LayoutNode[],
  addButtons: LayoutNode[],
): TransposedMatrixHint | null {
  const [labelHeaderNode, ...instanceNodes] = header;
  if (instanceNodes.length === 0) return null;

  let addNestedLabel: string | undefined;
  const instanceHeaders: string[] = [];
  for (const node of instanceNodes) {
    const { heading, nested } = splitInstanceHeading(node.text);
    if (heading) instanceHeaders.push(heading);
    if (nested && !addNestedLabel) addNestedLabel = nested;
  }
  if (instanceHeaders.length === 0) return null;

  // A nested add may also be a separate button sitting inside the header band
  // rather than text within the heading itself.
  if (!addNestedLabel) {
    const nestedButton = addButtons.find(
      (b) => NESTED_ADD_BUTTON.test(b.text) && !ADD_BUTTON.test(b.text),
    );
    if (nestedButton) addNestedLabel = nestedButton.text;
  }

  const addInstanceLabel = addButtons.find((b) => b.text !== addNestedLabel)?.text;

  return {
    labelHeader: labelHeaderNode.text,
    rowLabels: leftColumn.map((n) => n.text),
    instanceHeaders,
    addInstanceLabel,
    addNestedLabel,
  };
}

function buildRepeatingLog(
  header: LayoutNode[],
  bodyRows: LayoutNode[][],
  allNodes: LayoutNode[],
  addButtons: LayoutNode[],
): RepeatingTableHint | null {
  const columns = header.map((n) => n.text).filter(Boolean);
  if (columns.length < MIN_LOG_COLUMNS) return null;

  // Require the body to actually hold fields; a header over static text is a
  // reference table, not a log.
  if (!bodyRows.some((row) => row.some((n) => n.kind === 'control'))) return null;

  const headerTop = Math.min(...header.map((n) => n.y));
  const countLabel = allNodes
    .filter((n) => n.kind === 'label' && n.y < headerTop && COUNT_LINE.test(n.text))
    .map((n) => n.text)
    .sort((a, b) => a.length - b.length)[0];

  return { columns, addLabel: addButtons[0].text, countLabel };
}
