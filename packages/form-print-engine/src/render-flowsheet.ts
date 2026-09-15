/**
 * Print a flowsheet — parameters down the left, one column per occurrence
 * across the top, newest first (ADR-005 §4, workstream 7).
 *
 * The grid is form-core's `buildFlowsheet` model, the same one the React and
 * Angular `Flowsheet` components draw, so the paper copy of a shift's vitals
 * matches the screen exactly. A4 landscape by default: a day of q2h rounds is
 * twelve columns wide. When there are more columns than fit, the sheet is
 * split into page-sized column blocks, each repeating the parameter spine, so
 * every page is readable on its own.
 *
 * Output is a self-contained HTML string (inline CSS, @page in mm) for the
 * same rasterizers `renderPrintHtml` targets. Nothing here knows a patient:
 * the optional header lines are whatever the host passes.
 */

import type { FormDefinitionSchemas, HistoryEntry, Observation } from '@openmedform/form-schema-types';
import {
  buildFlowsheet,
  displayUnit,
  formatClock,
  formatDay,
  formatObservationValue,
  projectObservations,
  sameDay,
  type Flowsheet,
  type FlowsheetColumn,
  type FlowsheetRow,
} from '@openmedform/form-core';
import { esc } from './html';

export interface FlowsheetPrintOptions {
  /** Prior fills as the host stored them; projected against their own definition. */
  entries?: HistoryEntry[];
  /** Already-projected readings. May be combined with `entries`. */
  observations?: Observation[];
  /** Sheet title. Default: 'Observations'. */
  title?: string;
  /**
   * Header lines printed under the title, e.g. patient name and identifier,
   * ward, date range. Supplied by the host; the engine adds nothing.
   */
  headerLines?: string[];
  /** Newest N columns only. Default: all. */
  maxColumns?: number;
  /** Keep rows for fields with no readings (a blank chart to fill by hand). */
  includeEmptyRows?: boolean;
  /** Columns per page before the sheet continues on a new page. Default 12. */
  columnsPerPage?: number;
  /** IANA time zone for the column clocks. Default: the renderer's. */
  timeZone?: string;
  orientation?: 'portrait' | 'landscape';
  marginsMm?: { top: number; right: number; bottom: number; left: number };
  /** Footer note, e.g. "Printed 15 Sep 2026 14:32 by RN Priya". */
  footer?: string;
}

const DEFAULT_MARGINS = { top: 12, right: 10, bottom: 12, left: 10 };
const DEFAULT_COLUMNS_PER_PAGE = 12;

export function renderFlowsheetHtml(
  definition: FormDefinitionSchemas,
  options: FlowsheetPrintOptions = {},
): string {
  const all: Observation[] = [...(options.observations ?? [])];
  for (const e of options.entries ?? []) {
    const source = { ...(e.author ? { author: e.author } : {}), ...(e.source ?? {}) };
    all.push(
      ...projectObservations(e.definition ?? definition, e.data, {
        effectiveAt: e.effectiveAt,
        ...(Object.keys(source).length > 0 ? { source } : {}),
      }),
    );
  }
  const sheet = buildFlowsheet(definition, all, {
    maxColumns: options.maxColumns,
    includeEmptyRows: options.includeEmptyRows,
  });

  const orientation = options.orientation ?? 'landscape';
  const m = options.marginsMm ?? DEFAULT_MARGINS;
  const title = options.title ?? 'Observations';
  const clockOpts = options.timeZone ? { timeZone: options.timeZone } : {};
  const multiDay =
    sheet.columns.length > 1 &&
    !sheet.columns.every((c) => sameDay(c.effectiveAt, sheet.columns[0].effectiveAt, clockOpts));
  const perPage = Math.max(1, options.columnsPerPage ?? DEFAULT_COLUMNS_PER_PAGE);

  const header = `<h1 class="omf-print-title">${esc(title)}</h1>${
    options.headerLines?.length
      ? `<div class="omf-fs-header">${options.headerLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`
      : ''
  }`;

  let body: string;
  if (sheet.columns.length === 0) {
    body = `<p class="omf-fs-empty">No readings recorded.</p>`;
  } else {
    const blocks: string[] = [];
    for (let start = 0; start < sheet.columns.length; start += perPage) {
      const colIdx = sheet.columns.map((_, i) => i).slice(start, start + perPage);
      const cont = start > 0;
      blocks.push(
        `<section class="omf-fs-block${cont ? ' omf-fs-continued' : ''}">${
          cont ? `<div class="omf-fs-cont">${esc(title)} — continued</div>` : ''
        }${renderTable(sheet, colIdx, multiDay, clockOpts)}</section>`,
      );
    }
    body = blocks.join('\n');
  }

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>${css(orientation, m)}</style></head>
<body>
${header}
${body}
${options.footer ? `<div class="omf-fs-footer">${esc(options.footer)}</div>` : ''}
</body>
</html>`;
}

function renderTable(
  sheet: Flowsheet,
  colIdx: number[],
  multiDay: boolean,
  clockOpts: { timeZone?: string },
): string {
  const cols = colIdx.map((i) => sheet.columns[i]);
  const head = `<thead><tr><th class="omf-fs-param">Parameter</th>${cols
    .map((c) => headCell(c, multiDay, clockOpts))
    .join('')}</tr></thead>`;

  const rows: string[] = [];
  for (const section of sheet.sections) {
    if (section.label) {
      rows.push(
        `<tr class="omf-fs-section"><th colspan="${cols.length + 1}">${esc(section.label)}</th></tr>`,
      );
    }
    for (const row of section.rows) rows.push(rowHtml(row, colIdx));
  }
  return `<table class="omf-fs">${head}<tbody>${rows.join('')}</tbody></table>`;
}

function headCell(c: FlowsheetColumn, multiDay: boolean, clockOpts: { timeZone?: string }): string {
  const sub = [
    multiDay ? formatDay(c.effectiveAt, clockOpts) : '',
    c.authors.join(', '),
  ]
    .filter((s) => s.length > 0)
    .map((s) => `<div class="omf-fs-sub">${esc(s)}</div>`)
    .join('');
  return `<th class="omf-fs-col"><div>${esc(formatClock(c.effectiveAt, clockOpts))}</div>${sub}</th>`;
}

function rowHtml(row: FlowsheetRow, colIdx: number[]): string {
  const unit = row.unit && !row.mixedUnits ? ` <span class="omf-fs-unit">${esc(displayUnit(row.unit))}</span>` : '';
  const cells = colIdx
    .map((i) => {
      const cell = row.cells[i];
      const struck = cell.superseded
        .map((o) => `<s class="omf-fs-superseded">${esc(formatObservationValue(o, { unit: row.mixedUnits }))}</s>`)
        .join(' ');
      return `<td>${struck}${struck && cell.text ? ' ' : ''}${esc(cell.text)}</td>`;
    })
    .join('');
  return `<tr class="omf-fs-row"><th class="omf-fs-param">${esc(row.label)}${unit}</th>${cells}</tr>`;
}

function css(
  orientation: 'portrait' | 'landscape',
  m: { top: number; right: number; bottom: number; left: number },
): string {
  return [
    `@page { size: A4 ${orientation}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`,
    `* { box-sizing: border-box; }`,
    `body { font-family: Arial, "Helvetica Neue", sans-serif; font-size: 9.5pt; color: #000; margin: 0; }`,
    `.omf-print-title { font-size: 13pt; margin: 0 0 2mm; }`,
    `.omf-fs-header { font-size: 9.5pt; margin: 0 0 4mm; }`,
    `.omf-fs-header > div { margin-bottom: 0.5mm; }`,
    `.omf-fs-block { page-break-inside: auto; }`,
    `.omf-fs-continued { page-break-before: always; }`,
    `.omf-fs-cont { font-size: 9pt; font-style: italic; margin: 0 0 2mm; }`,
    `.omf-fs { border-collapse: collapse; width: 100%; table-layout: auto; }`,
    // Repeat the column header on every printed page of a long table.
    `.omf-fs thead { display: table-header-group; }`,
    `.omf-fs tr { page-break-inside: avoid; }`,
    `.omf-fs th, .omf-fs td { border: 0.3mm solid #000; padding: 1.2mm 2mm; white-space: nowrap; }`,
    `.omf-fs thead th { background: #eee; font-weight: bold; text-align: center; print-color-adjust: exact; -webkit-print-color-adjust: exact; }`,
    `.omf-fs .omf-fs-param { text-align: left; font-weight: bold; min-width: 40mm; }`,
    `.omf-fs td { text-align: center; }`,
    `.omf-fs-sub { font-weight: normal; font-size: 8pt; }`,
    `.omf-fs-unit { font-weight: normal; color: #444; }`,
    `.omf-fs-section th { text-align: left; background: #f4f4f4; font-size: 8.5pt; letter-spacing: 0.3pt; text-transform: uppercase; print-color-adjust: exact; -webkit-print-color-adjust: exact; }`,
    `.omf-fs-superseded { color: #666; }`,
    `.omf-fs-empty { font-style: italic; }`,
    `.omf-fs-footer { margin-top: 4mm; font-size: 8pt; color: #444; }`,
  ].join('\n');
}
